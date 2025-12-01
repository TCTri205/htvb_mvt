// Demo xử lý thông báo khi click chuông
document.addEventListener("DOMContentLoaded", () => {
  const bell = document.querySelector("button");
  bell?.addEventListener("click", () => {
    alert("Bạn có 3 thông báo mới cần xem!");
  });
});
