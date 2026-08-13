// Homepage-specific script: renders nav/footer, loads the current product
// lineup from the API, and wires up the inline newsletter form.
// (Shared card rendering lives in products-render.js)

async function loadHomeProducts() {
  const grid = document.getElementById('home-products');
  if (!grid) return;
  try {
    const { products } = await api('/api/products', { auth: false });
    grid.innerHTML = products.map(productCardHtml).join('');
    wireProductCardButtons(grid, products);
  } catch (err) {
    grid.innerHTML = `<p class="form-error">Couldn't load products: ${err.message}</p>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  renderNav('');
  renderFooter();
  loadHomeProducts();

  const homeNewsletter = document.getElementById('home-newsletter-form');
  if (homeNewsletter) {
    homeNewsletter.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = homeNewsletter.querySelector('input').value;
      try {
        await api('/api/newsletter', { method: 'POST', body: { email }, auth: false });
        homeNewsletter.innerHTML = '<p class="form-success">Thanks — check your inbox for your code.</p>';
      } catch (err) {
        alert(err.message);
      }
    });
  }
});
