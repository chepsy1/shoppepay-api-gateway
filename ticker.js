
(() => {
  const track = document.getElementById("deTickerTrack");
  if (!track) return;

  function generateName() {
    const length = Math.floor(Math.random() * 8) + 8;
    const letters = "abcdefghijklmnopqrstuvwxyz";
    const useNumber = Math.random() < 0.05;
    let name = "";
    const letterLength = useNumber ? length - 1 : length;
    for (let i = 0; i < letterLength; i++) {
      name += letters[Math.floor(Math.random() * letters.length)];
    }
    if (useNumber) name += Math.floor(Math.random() * 9) + 1;
    return name;
  }

  function censorName(name) {
    return name.charAt(0) + "*".repeat(name.length - 2) + name.charAt(name.length - 1);
  }

  const domains = [
    "https://shopee.co.id/",
    "https://id.shp.ee/",
    "https://s.shopee.co.id/",
    "https://shope.ee/"
  ];

  const packages = [
    { label: "5000 followers", weight: 10 },
    { label: "100 followers", weight: 22 },
    { label: "1000 followers", weight: 32 },
    { label: "1500 followers", weight: 20 },
    { label: "200 followers", weight: 15 },
    { label: "300 followers", weight: 15 },
    { label: "500 followers", weight: 24 },
    { label: "3000 followers", weight: 15 },
    { label: "2000 followers", weight: 15 },
    { label: "AKUN Shopee 10000 Followers", weight: 5 }
  ];

  function getRandomProduct() {
    const totalWeight = packages.reduce((sum, item) => sum + item.weight, 0);
    let random = Math.random() * totalWeight;
    for (const item of packages) {
      random -= item.weight;
      if (random < 0) return item.label;
    }
    return packages[packages.length - 1].label;
  }

  function generateTime() {
    const random = Math.random() * 100;
    if (random < 7) {
      return `${Math.floor(Math.random() * 59) + 1} menit yang lalu`;
    }
    if (random < 37) {
      if (Math.random() < 0.60) {
        return `${Math.floor(Math.random() * 21) + 3} jam yang lalu`;
      }
      return `${Math.floor(Math.random() * 2) + 1} jam yang lalu`;
    }
    return `${Math.floor(Math.random() * 7) + 2} hari yang lalu`;
  }

  function cartIcon() {
    return `<span class="de-ticker-cart" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="#ee4d2d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="9" cy="20" r="1.5"></circle>
        <circle cx="18" cy="20" r="1.5"></circle>
        <path d="M3 4h2l2.2 11.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 1.9-1.4L21 8H6"></path>
      </svg>
    </span>`;
  }

  function generateItems() {
    let html = "";
    for (let i = 0; i < 500; i++) {
      const name = censorName(generateName());
      const domain = domains[Math.floor(Math.random() * domains.length)];
      const product = getRandomProduct();
      const time = generateTime();

      html += `<div class="de-ticker-item">
        ${cartIcon()}
        <span class="de-ticker-content">
          <span class="de-ticker-top">
            <span class="de-ticker-link">${domain}${name}</span>
          </span>
          <span class="de-ticker-bottom">
            <span class="de-ticker-order">memesan <strong>${product}</strong></span>
            <span class="de-ticker-time">
              <span class="de-ticker-clock" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="#8a9298" stroke-width="2" stroke-linecap="round">
                  <circle cx="12" cy="12" r="9"></circle>
                  <path d="M12 7v5l3 2"></path>
                </svg>
              </span>
              ${time}
            </span>
          </span>
        </span>
      </div>`;
    }
    return html;
  }

  const items = generateItems();
  track.innerHTML = items + items;
})();
