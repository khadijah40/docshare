/* ============================================================
   DocShare — app.js
   All frontend logic lives here.
   No frameworks, just plain JavaScript.
============================================================ */

/* ──────────────────────────────────────────────
   CONFIGURATION
   The password is checked on the SERVER (api/auth.js).
   Never put secrets in frontend code.
────────────────────────────────────────────── */

// Tracks the file the user has picked but not yet uploaded
let selectedFile = null;

// Tracks which file id is pending deletion (used by the modal)
let pendingDeleteId = null;


/* ============================================================
   AUTH — Login / Logout
============================================================ */

/**
 * Called when the user clicks "Enter" on the login screen.
 * Sends the password to the server for verification.
 */
async function handleLogin() {
  const passwordInput = document.getElementById('password-input');
  const errorMsg      = document.getElementById('login-error');
  const password      = passwordInput.value.trim();

  if (!password) return; // ignore empty submit

  // Disable button while checking
  const btn = document.getElementById('login-btn');
  btn.disabled = true;
  btn.textContent = '…';

  try {
    // POST to our serverless function /api/auth
    const res  = await fetch('/api/auth', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ password }),
    });
    const data = await res.json();

    if (data.success) {
      // Save a simple session token in sessionStorage
      // (sessionStorage clears when the tab closes — intentional)
      sessionStorage.setItem('docshare_token', data.token);

      errorMsg.classList.add('hidden');
      showDashboard();
    } else {
      errorMsg.classList.remove('hidden');
      passwordInput.value = '';
      passwordInput.focus();
    }
  } catch (err) {
    errorMsg.textContent = 'Server error. Please try again.';
    errorMsg.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Enter';
  }
}

/** Log out — clear token and show login screen. */
function handleLogout() {
  sessionStorage.removeItem('docshare_token');
  showLogin();
}

/** Show the login screen, hide dashboard. */
function showLogin() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('dashboard-screen').classList.add('hidden');
}

/** Show the dashboard, hide login screen, then load files. */
function showDashboard() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('dashboard-screen').classList.remove('hidden');
  loadFiles(); // immediately fetch and display existing files
}

/**
 * On page load: check if the user already has a session token.
 * If yes, go straight to the dashboard.
 */
(function checkSession() {
  const token = sessionStorage.getItem('docshare_token');
  if (token) {
    showDashboard();
  }
})();

// Allow pressing Enter in the password field to submit
document.getElementById('password-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleLogin();
});


/* ============================================================
   DRAG-AND-DROP
============================================================ */

function handleDragOver(event) {
  event.preventDefault(); // required to allow drop
  document.getElementById('drop-zone').classList.add('drag-over');
}

function handleDragLeave() {
  document.getElementById('drop-zone').classList.remove('drag-over');
}

function handleDrop(event) {
  event.preventDefault();
  document.getElementById('drop-zone').classList.remove('drag-over');

  const file = event.dataTransfer.files[0];
  if (file) setSelectedFile(file);
}

function handleFileSelect(event) {
  const file = event.target.files[0];
  if (file) setSelectedFile(file);
}

/**
 * Called whenever a file is chosen (via click or drag).
 * Stores it in `selectedFile` and updates the UI.
 */
function setSelectedFile(file) {
  // Basic type check (server validates too, but let's be friendly)
  const allowed = ['application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'image/png', 'image/jpeg', 'image/gif', 'image/webp'];

  if (!allowed.includes(file.type) && !file.name.match(/\.(pdf|doc|docx|txt|png|jpg|jpeg|gif|webp)$/i)) {
    showUploadStatus('File type not supported.', 'error');
    return;
  }

  if (file.size > 10 * 1024 * 1024) { // 10 MB limit
    showUploadStatus('File is too large (max 10 MB).', 'error');
    return;
  }

  selectedFile = file;
  document.getElementById('selected-file-name').textContent = file.name;
  document.getElementById('selected-file').classList.remove('hidden');
  document.getElementById('upload-status').classList.add('hidden');
}


/* ============================================================
   FILE UPLOAD
============================================================ */

/**
 * Uploads the selected file.
 * 1. Sends file to /api/upload as multipart form data.
 * 2. The server uploads to Cloudinary and saves metadata to MongoDB.
 * 3. On success, refresh the files list.
 */
async function uploadFile() {
  if (!selectedFile) return;

  const token = sessionStorage.getItem('docshare_token');
  const btn   = document.querySelector('.upload-btn');

  btn.disabled    = true;
  btn.textContent = 'Uploading…';
  showUploadStatus('Uploading…', 'loading');

  // FormData lets us send a file as multipart/form-data
  const formData = new FormData();
  formData.append('file', selectedFile);

  try {
    const res  = await fetch('/api/upload', {
      method:  'POST',
      headers: { 'x-auth-token': token }, // send token in header (no body conflict with FormData)
      body:    formData,
    });
    const data = await res.json();

    if (res.ok && data.success) {
      showUploadStatus('File uploaded successfully!', 'success');
      // Reset the file picker
      selectedFile = null;
      document.getElementById('selected-file').classList.add('hidden');
      document.getElementById('file-input').value = '';
      // Reload the file list so the new file appears
      loadFiles();
    } else {
      showUploadStatus(data.error || 'Upload failed.', 'error');
    }
  } catch (err) {
    showUploadStatus('Network error. Please try again.', 'error');
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Upload';
  }
}

/** Show a status message below the upload area. */
function showUploadStatus(message, type) {
  const el = document.getElementById('upload-status');
  el.textContent = message;
  el.className   = `upload-status ${type}`; // 'success', 'error', or 'loading'
  el.classList.remove('hidden');
}


/* ============================================================
   FILES LIST
============================================================ */

/**
 * Fetches the list of uploaded files from /api/files
 * and renders them in the dashboard.
 */
async function loadFiles() {
  const token = sessionStorage.getItem('docshare_token');

  // Show loading state
  document.getElementById('files-loading').classList.remove('hidden');
  document.getElementById('files-empty').classList.add('hidden');
  document.getElementById('files-list').innerHTML = '';

  try {
    const res  = await fetch('/api/files', {
      headers: { 'x-auth-token': token },
    });
    const data = await res.json();

    document.getElementById('files-loading').classList.add('hidden');

    if (!res.ok) {
      document.getElementById('files-list').innerHTML =
        `<p style="color:var(--danger);text-align:center;font-size:14px">
          Error loading files.
        </p>`;
      return;
    }

    if (!data.files || data.files.length === 0) {
      document.getElementById('files-empty').classList.remove('hidden');
      return;
    }

    // Render each file
    data.files.forEach(file => renderFileItem(file));

  } catch (err) {
    document.getElementById('files-loading').classList.add('hidden');
    document.getElementById('files-list').innerHTML =
      `<p style="color:var(--danger);text-align:center;font-size:14px">
        Network error.
      </p>`;
  }
}

/**
 * Creates and appends a single file row to the files list.
 * @param {Object} file - file metadata from MongoDB
 */
function renderFileItem(file) {
  const list = document.getElementById('files-list');

  // Format the upload date nicely
  const date = new Date(file.uploadedAt);
  const formattedDate = date.toLocaleDateString('en-US', {
    year:  'numeric',
    month: 'short',
    day:   'numeric',
    hour:  '2-digit',
    minute:'2-digit',
  });

  // Pick an emoji icon based on file type
  const icon = getFileIcon(file.fileName);

  // Build the HTML for this file row
  const item = document.createElement('div');
  item.className  = 'file-item';
  item.dataset.id = file._id; // store MongoDB id for deletion

  item.innerHTML = `
    <div class="file-icon">${icon}</div>
    <div class="file-info">
      <div class="file-name" title="${escapeHtml(file.fileName)}">${escapeHtml(file.fileName)}</div>
      <div class="file-date">${formattedDate}</div>
    </div>
    <div class="file-actions">
      <button class="btn-action btn-download" onclick="downloadFile('${escapeHtml(file.fileUrl)}', '${escapeHtml(file.fileName)}')">
        ↓ Download
      </button>
      <button class="btn-action btn-del" onclick="confirmDelete('${file._id}')">
        ✕
      </button>
    </div>
  `;

  list.appendChild(item);
}

/**
 * Returns an emoji based on the file extension.
 * @param {string} name - file name
 */
function getFileIcon(name) {
  const ext = name.split('.').pop().toLowerCase();
  const icons = {
    pdf:  '📄',
    doc:  '📝', docx: '📝',
    txt:  '📃',
    png:  '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', webp: '🖼️',
  };
  return icons[ext] || '📁';
}

/**
 * Triggers a file download by creating a temporary <a> tag.
 * @param {string} url - Cloudinary URL of the file
 * @param {string} name - original file name
 */
function downloadFile(url, name) {
  const a    = document.createElement('a');
  a.href     = url;
  a.download = name;
  a.target   = '_blank'; // open in new tab as fallback (for cross-origin)
  a.rel      = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}


/* ============================================================
   DELETE — Confirm Modal
============================================================ */

/** Show the delete confirmation modal. */
function confirmDelete(fileId) {
  pendingDeleteId = fileId;
  document.getElementById('confirm-modal').classList.remove('hidden');

  // Wire up the confirm button
  document.getElementById('confirm-delete-btn').onclick = () => deleteFile(fileId);
}

/** Close the modal without deleting. */
function closeModal() {
  pendingDeleteId = null;
  document.getElementById('confirm-modal').classList.add('hidden');
}

/**
 * Sends a DELETE request to /api/delete with the file id.
 * The server removes from Cloudinary and MongoDB.
 */
async function deleteFile(fileId) {
  const token = sessionStorage.getItem('docshare_token');
  closeModal();

  try {
    const res  = await fetch('/api/delete', {
      method:  'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'x-auth-token': token,
      },
      body: JSON.stringify({ fileId }),
    });
    const data = await res.json();

    if (res.ok && data.success) {
      // Remove the file row from the DOM without a full reload
      const el = document.querySelector(`.file-item[data-id="${fileId}"]`);
      if (el) el.remove();

      // Show empty state if nothing left
      if (document.querySelectorAll('.file-item').length === 0) {
        document.getElementById('files-empty').classList.remove('hidden');
      }
    } else {
      alert(data.error || 'Delete failed.');
    }
  } catch (err) {
    alert('Network error. Please try again.');
  }
}


/* ============================================================
   UTILITIES
============================================================ */

/**
 * Prevent XSS by escaping HTML special characters.
 * Always do this before inserting untrusted strings into innerHTML.
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}
