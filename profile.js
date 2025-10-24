const form = document.getElementById('profileForm');

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = document.getElementById('name').value;
  const address = document.getElementById('address').value;
  const email = document.getElementById('email').value;

  // Ambil nomor WA dari localStorage atau session (setelah login WA)
  const phone = localStorage.getItem('userPhone');
  if (!phone) {
    alert('Nomor WA tidak ditemukan. Silahkan login ulang.');
    window.location.href = '/login.html';
    return;
  }

  try {
    const res = await fetch('/api/update-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, name, address, email })
    });

    const data = await res.json();

    if (res.ok) {
      // Redirect ke dashboard
      window.location.href = '/dashboard.html';
    } else {
      alert(data.error || 'Gagal menyimpan data.');
    }
  } catch (err) {
    console.error(err);
    alert('Terjadi kesalahan server.');
  }
});
