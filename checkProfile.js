// Ambil nomor WA dari localStorage
const phone = localStorage.getItem('userPhone');
if (!phone) {
  window.location.href = '/login.html';
} else {
  // Cek apakah profile sudah lengkap
  fetch(`/api/check-profile?phone=${phone}`)
    .then(res => res.json())
    .then(data => {
      if (data.exists === false || data.complete === false) {
        // Belum ada data / belum lengkap
        window.location.href = '/profile.html';
      } else {
        // Sudah lengkap
        window.location.href = '/dashboard.html';
      }
    })
    .catch(err => {
      console.error(err);
      alert('Terjadi kesalahan saat mengecek profile.');
    });
}
