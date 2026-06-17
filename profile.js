// =============================================
// FeelShare — profile.js
// =============================================

// ── Helpers ──────────────────────────────────

function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${msg}</span>`;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}
function openModal(id) {
  document.getElementById(id).classList.add('active');
}

// Make closeModal globally accessible (also defined inline in HTML, this overwrites cleanly)
window.closeModal = closeModal;
window.openModal  = openModal;

// ── Storage Keys ─────────────────────────────
const KEYS = {
  user:       'feelshare_user',       // { name, username, email, bio, phone, pin }
  avatar:     'feelshare_avatar',     // base64 data-URL string
  linked:     'feelshare_linked',     // array of { name, username, avatar }
  session:    'feelshare_session',    // { loggedIn: true }
};

// ── Load / Save user data ────────────────────

function loadUser() {
  try { return JSON.parse(localStorage.getItem(KEYS.user)) || {}; }
  catch { return {}; }
}

function saveUser(data) {
  localStorage.setItem(KEYS.user, JSON.stringify(data));
}

function loadLinked() {
  try { return JSON.parse(localStorage.getItem(KEYS.linked)) || []; }
  catch { return []; }
}

// ── Render profile ───────────────────────────

function getInitial(name) {
  return name ? name.trim()[0].toUpperCase() : '?';
}

function renderProfile() {
  const user   = loadUser();
  const avatar = localStorage.getItem(KEYS.avatar);

  // Header name + username
  document.getElementById('displayName').textContent     = user.name     || 'Anonymous';
  document.getElementById('displayUsername').textContent = user.username  ? `@${user.username}` : '@username';

  // Fields
  document.getElementById('displayBio').textContent          = user.bio      || 'No bio yet.';
  document.getElementById('displayFullName').textContent     = user.name     || '-';
  document.getElementById('displayUsernameField').textContent= user.username || '-';
  document.getElementById('displayEmail').textContent        = user.email    || '-';
  document.getElementById('displayPhone').textContent        = user.phone    || 'Not set';

  // Avatar
  const avatarEl  = document.getElementById('profileAvatarDisplay');
  const initialEl = document.getElementById('profileInitial');
  if (avatar) {
    avatarEl.style.backgroundImage = `url(${avatar})`;
    avatarEl.style.backgroundSize  = 'cover';
    avatarEl.style.backgroundPosition = 'center';
    initialEl.style.display = 'none';
  } else {
    avatarEl.style.backgroundImage = '';
    initialEl.style.display = '';
    initialEl.textContent = getInitial(user.name);
  }

  // Linked people
  renderLinked();
}

function renderLinked() {
  const list    = loadLinked();
  const container = document.getElementById('profileLinkedList');
  if (!list.length) {
    container.innerHTML = '<div class="empty-linked"><small>No linked accounts yet.</small></div>';
    return;
  }
  container.innerHTML = list.map((person, i) => `
    <div class="profile-field" data-linked-index="${i}">
      <div class="linked-avatar">${getInitial(person.name)}</div>
      <div class="field-content">
        <div class="field-label">${escapeHtml(person.name)}</div>
        <div class="field-value">@${escapeHtml(person.username)}</div>
      </div>
      <button class="field-edit btn-danger-soft" onclick="unlinkPerson(${i})" title="Unlink">
        <i class="fa-solid fa-link-slash"></i>
      </button>
    </div>
  `).join('');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Unlink person ─────────────────────────────

window.unlinkPerson = function(index) {
  const list = loadLinked();
  list.splice(index, 1);
  localStorage.setItem(KEYS.linked, JSON.stringify(list));
  renderLinked();
  showToast('Person unlinked.', 'info');
};

// ── Edit Modal ───────────────────────────────

window.openEditModal = function(field) {
  const user = loadUser();
  const titleEl   = document.getElementById('editFieldTitle');
  const contentEl = document.getElementById('editFieldContent');
  const saveBtn   = document.getElementById('saveFieldBtn');

  // Remove old save listener
  const newSaveBtn = saveBtn.cloneNode(true);
  saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);

  switch (field) {
    case 'bio':
      titleEl.textContent = 'Edit Bio';
      contentEl.innerHTML = `
        <div class="form-group">
          <label>About you</label>
          <textarea id="editBio" class="form-input" rows="4" maxlength="200" placeholder="Say something about yourself…">${escapeHtml(user.bio || '')}</textarea>
          <small class="char-count" id="bioCount">${(user.bio||'').length}/200</small>
        </div>`;
      contentEl.querySelector('#editBio').addEventListener('input', function() {
        document.getElementById('bioCount').textContent = `${this.value.length}/200`;
      });
      newSaveBtn.addEventListener('click', () => {
        const val = document.getElementById('editBio').value.trim();
        saveUser({ ...loadUser(), bio: val });
        renderProfile();
        closeModal('editFieldModal');
        showToast('Bio updated!', 'success');
      });
      break;

    case 'name':
      titleEl.textContent = 'Edit Full Name';
      contentEl.innerHTML = `
        <div class="form-group">
          <label>Full Name</label>
          <input id="editName" class="form-input" type="text" maxlength="80"
            placeholder="Your full name" value="${escapeHtml(user.name || '')}" />
        </div>`;
      newSaveBtn.addEventListener('click', () => {
        const val = document.getElementById('editName').value.trim();
        if (!val) { showToast('Name cannot be empty.', 'error'); return; }
        saveUser({ ...loadUser(), name: val });
        renderProfile();
        closeModal('editFieldModal');
        showToast('Name updated!', 'success');
      });
      break;

    case 'phone':
      titleEl.textContent = 'Edit Phone Number';
      contentEl.innerHTML = `
        <div class="form-group">
          <label>Phone Number</label>
          <input id="editPhone" class="form-input" type="tel" maxlength="20"
            placeholder="+63 9XX XXX XXXX" value="${escapeHtml(user.phone || '')}" />
        </div>`;
      newSaveBtn.addEventListener('click', () => {
        const val = document.getElementById('editPhone').value.trim();
        saveUser({ ...loadUser(), phone: val });
        renderProfile();
        closeModal('editFieldModal');
        showToast('Phone number updated!', 'success');
      });
      break;

    default:
      return;
  }

  openModal('editFieldModal');
};

// ── Avatar Upload ────────────────────────────

document.getElementById('avatarUpload').addEventListener('change', function () {
  const file = this.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showToast('Please choose an image file.', 'error');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showToast('Image must be under 5 MB.', 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    localStorage.setItem(KEYS.avatar, e.target.result);
    renderProfile();
    showToast('Profile photo updated!', 'success');
  };
  reader.readAsDataURL(file);
  this.value = ''; // reset so same file can be re-picked
});

// ── PIN Change ───────────────────────────────

function getPinValue(attr) {
  return [...document.querySelectorAll(`[${attr}]`)]
    .map(i => i.value)
    .join('');
}

function clearPinInputs() {
  ['data-curr-pin','data-new-pin','data-new-pin-confirm'].forEach(attr => {
    document.querySelectorAll(`[${attr}]`).forEach(el => {
      el.value = '';
      el.classList.remove('filled');
    });
  });
}

document.getElementById('changePinBtn').addEventListener('click', () => {
  const user    = loadUser();
  const current = getPinValue('data-curr-pin');
  const newPin  = getPinValue('data-new-pin');
  const confirm = getPinValue('data-new-pin-confirm');

  if (current.length < 4 || newPin.length < 4 || confirm.length < 4) {
    showToast('Please fill all PIN fields.', 'error'); return;
  }

  const storedPin = user.pin || '0000'; // fallback default PIN
  if (current !== storedPin) {
    showToast('Current PIN is incorrect.', 'error'); return;
  }
  if (newPin !== confirm) {
    showToast('New PINs do not match.', 'error'); return;
  }
  if (newPin === current) {
    showToast('New PIN must differ from the current one.', 'error'); return;
  }

  saveUser({ ...user, pin: newPin });
  clearPinInputs();
  closeModal('settingsModal');
  showToast('PIN changed successfully!', 'success');
});

// Clear PIN inputs when settings modal is closed
document.querySelector('[onclick="closeModal(\'settingsModal\')"]')
  ?.addEventListener('click', clearPinInputs);

// ── Logout ───────────────────────────────────

document.getElementById('logoutBtn').addEventListener('click', () => {
  if (confirm('Are you sure you want to log out?')) {
    localStorage.removeItem(KEYS.session);
    window.location.href = 'index.html';
  }
});

// ── Init ─────────────────────────────────────

renderProfile();