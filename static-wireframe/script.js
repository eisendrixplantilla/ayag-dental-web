// ============================================
// Ayag Dental Clinic - Static Wireframe Scripts
// Toast notifications, modals, and button handlers
// ============================================

// --- Toast Notification System ---
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container') || createToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  toast.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span class="toast-msg">${message}</span><button class="toast-close" onclick="this.parentElement.remove()">✕</button>`;
  container.appendChild(toast);
  setTimeout(() => { toast.classList.add('toast-show'); }, 10);
  setTimeout(() => { toast.classList.remove('toast-show'); setTimeout(() => toast.remove(), 300); }, 3500);
}

function createToastContainer() {
  const c = document.createElement('div');
  c.id = 'toast-container';
  document.body.appendChild(c);
  return c;
}

// --- Modal System ---
function showModal(title, body, actions) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3 class="modal-title">${title}</h3>
        <button class="modal-close" onclick="closeModal(this)">✕</button>
      </div>
      <div class="modal-body">${body}</div>
      ${actions ? `<div class="modal-actions">${actions}</div>` : ''}
    </div>`;
  document.body.appendChild(overlay);
  setTimeout(() => overlay.classList.add('modal-open'), 10);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(overlay); });
}

function showConfirm(title, message, onConfirm) {
  const id = 'confirm-' + Date.now();
  window[id] = onConfirm;
  showModal(title, `<p>${message}</p>`,
    `<button class="btn btn-outline" onclick="closeModal(this)">Cancel</button>
     <button class="btn btn-primary" onclick="window['${id}'](); closeModal(this);">Confirm</button>`);
}

function closeModal(el) {
  const overlay = el.closest('.modal-overlay') || el;
  overlay.classList.remove('modal-open');
  setTimeout(() => overlay.remove(), 300);
}

// --- Form Modal Helper ---
function showFormModal(title, fields, onSubmit) {
  let formHtml = '<form class="modal-form space-y-sm" onsubmit="return false;">';
  fields.forEach(f => {
    if (f.type === 'select') {
      formHtml += `<div><label class="label">${f.label}</label><select class="select" name="${f.name}">${f.options.map(o => `<option value="${o}">${o}</option>`).join('')}</select></div>`;
    } else if (f.type === 'textarea') {
      formHtml += `<div><label class="label">${f.label}</label><textarea class="input" name="${f.name}" rows="3" placeholder="${f.placeholder || ''}">${f.value || ''}</textarea></div>`;
    } else {
      formHtml += `<div><label class="label">${f.label}</label><input class="input" type="${f.type || 'text'}" name="${f.name}" value="${f.value || ''}" placeholder="${f.placeholder || ''}"></div>`;
    }
  });
  formHtml += '</form>';
  const id = 'form-' + Date.now();
  window[id] = onSubmit;
  showModal(title, formHtml,
    `<button class="btn btn-outline" onclick="closeModal(this)">Cancel</button>
     <button class="btn btn-primary" onclick="window['${id}'](); closeModal(this);">Save</button>`);
}

// --- Sign Out ---
document.querySelectorAll('.btn-signout').forEach(btn => {
  btn.addEventListener('click', () => {
    showConfirm('Sign Out', 'Are you sure you want to sign out?', () => {
      showToast('Signed out successfully', 'info');
      setTimeout(() => { window.location.href = 'login.html'; }, 1000);
    });
  });
});

// --- Auth Pages ---
// Login
document.querySelectorAll('.btn-primary').forEach(btn => {
  const text = btn.textContent.trim();

  if (text === 'Sign In') {
    btn.addEventListener('click', () => {
      const email = btn.closest('form')?.querySelector('input[type="email"]')?.value;
      if (!email) { showToast('Please enter your email address', 'warning'); return; }
      showToast('Signing in...', 'info');
      setTimeout(() => { showToast('Login successful! Redirecting...', 'success'); }, 1000);
    });
  }

  if (text === 'Create Account') {
    btn.addEventListener('click', () => {
      const name = btn.closest('form')?.querySelector('input[placeholder="John Smith"]')?.value;
      const email = btn.closest('form')?.querySelector('input[type="email"]')?.value;
      if (!name || !email) { showToast('Please fill in all fields', 'warning'); return; }
      showToast('Account created! Redirecting to verification...', 'success');
      setTimeout(() => { window.location.href = 'verify.html'; }, 1500);
    });
  }

  if (text === 'Send Reset Code') {
    btn.addEventListener('click', () => {
      const email = btn.closest('form')?.querySelector('input[type="email"]')?.value;
      if (!email) { showToast('Please enter your email address', 'warning'); return; }
      showToast(`Password reset code sent to ${email}`, 'success');
    });
  }
});

// --- Time Slot Selection ---
document.querySelectorAll('.time-slot.available, .time-slot.selected').forEach(slot => {
  slot.addEventListener('click', () => {
    document.querySelectorAll('.time-slot').forEach(s => {
      if (s.classList.contains('selected')) {
        s.classList.remove('selected');
        s.classList.add('available');
      }
    });
    slot.classList.remove('available');
    slot.classList.add('selected');
    showToast(`Time slot ${slot.textContent.trim()} selected`, 'info');
  });
});

// --- Tab Switching ---
document.querySelectorAll('.tabs-list').forEach(tabList => {
  tabList.querySelectorAll('.tab-btn').forEach(tab => {
    tab.addEventListener('click', () => {
      tabList.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      showToast(`Switched to "${tab.textContent.trim()}" tab`, 'info');
    });
  });
});

// --- Confirm Appointment (Online Appointments) ---
document.querySelectorAll('.btn-primary.btn-sm').forEach(btn => {
  if (btn.textContent.includes('Confirm')) {
    btn.addEventListener('click', () => {
      const row = btn.closest('tr');
      const patient = row?.querySelector('td')?.textContent?.trim();
      showConfirm('Confirm Appointment',
        `Are you sure you want to confirm the appointment for <strong>${patient}</strong>?<br><br>A confirmation SMS will be sent to the patient's registered phone number.`,
        () => {
          const statusCell = row?.querySelectorAll('td');
          if (statusCell) {
            const actionCell = btn.closest('td');
            if (actionCell) actionCell.innerHTML = '<span class="badge badge-success">confirmed</span>';
          }
          showToast(`Appointment for ${patient} confirmed! SMS notification sent.`, 'success');
        });
    });
  }
});

// --- Decline Appointment ---
document.querySelectorAll('.btn-destructive-outline.btn-sm').forEach(btn => {
  if (btn.textContent.includes('Decline')) {
    btn.addEventListener('click', () => {
      const row = btn.closest('tr');
      const patient = row?.querySelector('td')?.textContent?.trim();
      showFormModal('Decline Appointment', [
        { label: 'Reason for Declining', name: 'reason', type: 'select', options: ['Dentist unavailable', 'Schedule conflict', 'Service not available', 'Other'] },
        { label: 'Custom Message to Patient', name: 'message', type: 'textarea', placeholder: 'Optional message to send to the patient...' }
      ], () => {
        const actionCell = btn.closest('td');
        if (actionCell) actionCell.innerHTML = '<span class="badge badge-destructive">declined</span>';
        showToast(`Appointment for ${patient} has been declined. Patient notified via SMS.`, 'warning');
      });
    });
  }
});

// --- Walk-in: Add Appointment ---
document.querySelectorAll('.btn-primary.w-full').forEach(btn => {
  const text = btn.textContent.trim();

  if (text.includes('Add Walk-in')) {
    btn.addEventListener('click', () => {
      const form = btn.closest('.card-content');
      const name = form?.querySelector('input[placeholder="Enter patient name"]')?.value;
      if (!name) { showToast('Please enter patient name', 'warning'); return; }
      showToast(`Walk-in appointment for ${name} has been registered!`, 'success');
    });
  }

  if (text.includes('Confirm Appointment')) {
    btn.addEventListener('click', () => {
      const form = btn.closest('.card-content');
      const service = form?.querySelector('select')?.value;
      if (!service || service === 'Choose a service') { showToast('Please select a service', 'warning'); return; }
      showConfirm('Confirm Booking', 'Are you sure you want to book this appointment?<br><br>You will receive a confirmation notification.', () => {
        showToast('Appointment booked successfully! 📅', 'success');
      });
    });
  }
});

// --- Delete Buttons ---
document.querySelectorAll('[data-action="delete"]').forEach(btn => {
  btn.addEventListener('click', () => {
    const row = btn.closest('tr') || btn.closest('.list-item');
    const name = row?.querySelector('.font-medium, .item-name')?.textContent?.trim() || 'this item';
    showConfirm('Delete Confirmation', `Are you sure you want to delete <strong>${name}</strong>?<br><br>This action cannot be undone.`, () => {
      if (row) { row.style.transition = 'opacity 0.3s'; row.style.opacity = '0'; setTimeout(() => row.remove(), 300); }
      showToast(`${name} has been deleted`, 'success');
    });
  });
});

// --- Edit Buttons ---
document.querySelectorAll('[data-action="edit"]').forEach(btn => {
  btn.addEventListener('click', () => {
    const row = btn.closest('tr') || btn.closest('.list-item');
    const name = row?.querySelector('.font-medium, .item-name')?.textContent?.trim() || 'Record';
    showModal('Edit ' + name,
      `<div class="space-y-sm">
        <div><label class="label">Name</label><input class="input" value="${name}"></div>
        <div><label class="label">Notes</label><textarea class="input" rows="3" placeholder="Add notes..."></textarea></div>
      </div>`,
      `<button class="btn btn-outline" onclick="closeModal(this)">Cancel</button>
       <button class="btn btn-primary" onclick="showToast('${name} updated successfully', 'success'); closeModal(this);">Save Changes</button>`
    );
  });
});

// --- View Buttons ---
document.querySelectorAll('[data-action="view"]').forEach(btn => {
  btn.addEventListener('click', () => {
    const row = btn.closest('tr');
    const cells = row?.querySelectorAll('td');
    if (!cells) return;
    const name = row?.querySelector('.font-medium')?.textContent?.trim() || 'Patient';
    let details = '';
    cells.forEach((cell, i) => {
      const th = row.closest('table')?.querySelectorAll('th')[i];
      if (th && !cell.querySelector('button')) {
        details += `<div class="flex justify-between" style="padding:8px 0; border-bottom:1px solid var(--border)"><span class="text-muted">${th.textContent}</span><span class="font-medium">${cell.innerHTML}</span></div>`;
      }
    });
    showModal(name + ' Details', details, `<button class="btn btn-primary" onclick="closeModal(this)">Close</button>`);
  });
});

// --- Print Receipt ---
document.querySelectorAll('[data-action="print"]').forEach(btn => {
  btn.addEventListener('click', () => {
    const row = btn.closest('tr');
    const id = row?.querySelector('.font-mono')?.textContent?.trim();
    const patient = row?.querySelector('.font-medium')?.textContent?.trim();
    const service = row?.querySelectorAll('td')[2]?.textContent?.trim();
    const amount = row?.querySelector('.font-semibold')?.textContent?.trim();
    showModal('Receipt', `
      <div style="border:2px dashed var(--border); border-radius:12px; padding:24px; text-align:center;">
        <h2 style="font-size:20px; margin-bottom:4px;">Ayag Dental Clinic</h2>
        <p class="text-sm text-muted">123 Health St, Manila</p>
        <hr style="margin:16px 0; border-color:var(--border)">
        <div class="flex justify-between" style="padding:4px 0"><span class="text-muted">Receipt #</span><span class="font-medium">${id}</span></div>
        <div class="flex justify-between" style="padding:4px 0"><span class="text-muted">Patient</span><span class="font-medium">${patient}</span></div>
        <div class="flex justify-between" style="padding:4px 0"><span class="text-muted">Service</span><span class="font-medium">${service}</span></div>
        <hr style="margin:16px 0; border-color:var(--border)">
        <div class="flex justify-between" style="padding:4px 0"><span class="font-semibold">Total</span><span class="font-bold" style="font-size:20px; color:var(--primary)">${amount}</span></div>
        <p class="text-xs text-muted" style="margin-top:16px">Thank you for choosing Ayag Dental Clinic!</p>
      </div>`,
      `<button class="btn btn-outline" onclick="closeModal(this)">Close</button>
       <button class="btn btn-primary" onclick="showToast('Receipt sent to printer', 'success'); closeModal(this);">Print</button>`
    );
  });
});

// --- Add Patient ---
document.querySelectorAll('.btn-primary').forEach(btn => {
  if (btn.textContent.includes('Add Patient')) {
    btn.addEventListener('click', () => {
      showFormModal('Add New Patient', [
        { label: 'Full Name', name: 'name', placeholder: 'Enter patient name' },
        { label: 'Age', name: 'age', type: 'number', placeholder: 'Age' },
        { label: 'Phone Number', name: 'phone', placeholder: '09XXXXXXXXX' },
        { label: 'Email', name: 'email', type: 'email', placeholder: 'patient@email.com' }
      ], () => { showToast('New patient record added successfully!', 'success'); });
    });
  }

  if (btn.textContent.includes('Add Item')) {
    btn.addEventListener('click', () => {
      showFormModal('Add Inventory Item', [
        { label: 'Item Name', name: 'name', placeholder: 'Enter item name' },
        { label: 'Category', name: 'category', type: 'select', options: ['Filling', 'Anesthesia', 'PPE', 'Imaging', 'Ortho', 'Other'] },
        { label: 'Quantity', name: 'qty', type: 'number', placeholder: 'Enter quantity' },
        { label: 'Minimum Stock Level', name: 'min', type: 'number', placeholder: 'Min stock' }
      ], () => { showToast('Inventory item added successfully!', 'success'); });
    });
  }

  if (btn.textContent.includes('Record Payment')) {
    btn.addEventListener('click', () => {
      showFormModal('Record Payment', [
        { label: 'Patient Name', name: 'patient', placeholder: 'Enter patient name' },
        { label: 'Service', name: 'service', type: 'select', options: ['Dental Cleaning', 'Tooth Extraction', 'Root Canal', 'Check-up', 'Filling', 'Teeth Whitening', 'Orthodontics'] },
        { label: 'Amount (₱)', name: 'amount', type: 'number', placeholder: 'Enter amount' },
        { label: 'Payment Method', name: 'method', type: 'select', options: ['Cash', 'GCash', 'Maya', 'Card', 'Bank Transfer'] }
      ], () => { showToast('Payment recorded successfully!', 'success'); });
    });
  }

  if (btn.textContent.includes('Add Staff')) {
    btn.addEventListener('click', () => {
      showFormModal('Add Staff Account', [
        { label: 'Full Name', name: 'name', placeholder: 'Enter staff name' },
        { label: 'Email', name: 'email', type: 'email', placeholder: 'staff@ayagdental.com' },
        { label: 'Role', name: 'role', type: 'select', options: ['Dentist', 'Nurse', 'Receptionist', 'Assistant'] },
        { label: 'Temporary Password', name: 'password', type: 'password', placeholder: '••••••••' }
      ], () => { showToast('Staff account created! Login credentials sent via email.', 'success'); });
    });
  }
});

// --- Save Buttons (Settings) ---
document.querySelectorAll('.btn-primary, .btn-ghost.btn-sm').forEach(btn => {
  const text = btn.textContent.trim();
  if (text === 'Save Hours') {
    btn.addEventListener('click', () => { showToast('Clinic hours updated successfully!', 'success'); });
  }
  if (text === 'Save Changes') {
    btn.addEventListener('click', () => { showToast('Changes saved successfully!', 'success'); });
  }
  if (text === 'Save') {
    btn.addEventListener('click', () => {
      const row = btn.closest('tr');
      const service = row?.querySelector('.font-medium')?.textContent?.trim();
      showToast(`${service || 'Service'} price updated!`, 'success');
    });
  }
});

// --- Download PDF/CSV ---
document.querySelectorAll('.btn-outline.btn-sm').forEach(btn => {
  const text = btn.textContent.trim();
  if (text.includes('PDF')) {
    btn.addEventListener('click', () => {
      const card = btn.closest('.card');
      const title = card?.querySelector('.font-semibold, .card-title')?.textContent?.trim() || 'Report';
      showToast(`Generating ${title} PDF... Download will start shortly.`, 'info');
      setTimeout(() => showToast(`${title}.pdf downloaded successfully!`, 'success'), 2000);
    });
  }
  if (text.includes('CSV')) {
    btn.addEventListener('click', () => {
      const card = btn.closest('.card');
      const title = card?.querySelector('.font-semibold, .card-title')?.textContent?.trim() || 'Report';
      showToast(`Exporting ${title} as CSV...`, 'info');
      setTimeout(() => showToast(`${title}.csv downloaded successfully!`, 'success'), 1500);
    });
  }
});

// --- Cancel Appointment ---
document.querySelectorAll('[data-action="cancel"]').forEach(btn => {
  btn.addEventListener('click', () => {
    const row = btn.closest('.list-item') || btn.closest('tr');
    const name = row?.querySelector('.item-name, .font-medium')?.textContent?.trim() || 'Appointment';
    showConfirm('Cancel Appointment', `Are you sure you want to cancel <strong>${name}</strong>?<br><br>The patient will be notified.`, () => {
      if (row) { row.style.transition = 'opacity 0.3s'; row.style.opacity = '0'; setTimeout(() => row.remove(), 300); }
      showToast(`${name} appointment cancelled. Patient notified.`, 'warning');
    });
  });
});

// --- Search Filter ---
document.querySelectorAll('.input-icon .input[placeholder*="Search"]').forEach(input => {
  input.addEventListener('input', () => {
    const query = input.value.toLowerCase();
    const table = input.closest('.card')?.querySelector('table');
    if (!table) return;
    table.querySelectorAll('tbody tr').forEach(row => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(query) ? '' : 'none';
    });
  });
});

// --- Hamburger Menu (mobile) ---
document.querySelectorAll('.topbar span, .topbar svg').forEach(el => {
  el.style.cursor = 'pointer';
  el.addEventListener('click', () => {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
      const isVisible = sidebar.style.display !== 'none' && sidebar.style.display !== '';
      if (window.innerWidth <= 768) {
        sidebar.style.display = isVisible ? 'flex' : 'none';
        sidebar.style.position = 'fixed';
        sidebar.style.zIndex = '1000';
        sidebar.style.top = '0';
        sidebar.style.left = '0';
        sidebar.style.height = '100vh';
      }
    }
  });
});
