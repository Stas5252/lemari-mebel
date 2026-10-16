(() => {
  const catalog = document.getElementById('projects');
  if (!catalog) return;
  const grid = document.getElementById('cards');
  const cards = Array.from(grid.querySelectorAll('.catalog-card'));
  const search = document.getElementById('catalogSearch');
  const layout = document.getElementById('catalogLayout');
  const color = document.getElementById('catalogColor');
  const sort = document.getElementById('catalogSort');
  const tabs = Array.from(catalog.querySelectorAll('[data-category]'));
  const dialog = document.getElementById('catalogDialog');
  const primary = document.getElementById('catalogDialogPrimary');
  let category = 'all';
  let currentCard = null;
  let previousOverflow = '';

  const normalize = value => value.normalize('NFKC').toLocaleLowerCase('ru').replace(/ё/g, 'е').trim();
  const title = card => card.querySelector('h3').textContent.trim();
  const categoryMatches = card => category === 'all' || card.dataset.kind === category;

  function renderCatalog() {
    const terms = normalize(search.value).split(/\s+/).filter(Boolean);
    let count = 0;
    cards.forEach(card => {
      const text = normalize(card.textContent + ' ' + card.dataset.search);
      const visible = categoryMatches(card)
        && (layout.value === 'all' || card.dataset.layout === layout.value)
        && (color.value === 'all' || card.dataset.colors.split(' ').includes(color.value))
        && terms.every(term => text.includes(term));
      card.hidden = !visible;
      if (visible) count++;
    });
    const ordered = [...cards];
    if (sort.value === 'featured') ordered.sort((a, b) => Number(a.dataset.order) - Number(b.dataset.order));
    else ordered.sort((a, b) => title(a).localeCompare(title(b), 'ru') * (sort.value === 'name-desc' ? -1 : 1));
    ordered.forEach(card => grid.appendChild(card));
    const ending = count % 10 === 1 && count % 100 !== 11 ? 'проект' : [2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100) ? 'проекта' : 'проектов';
    document.getElementById('catalogCount').textContent = `${count} ${ending}`;
    document.getElementById('catalogEmpty').hidden = count !== 0;
    const active = category !== 'all' || layout.value !== 'all' || color.value !== 'all' || terms.length > 0;
    document.getElementById('catalogResetTop').hidden = !active;
    tabs.forEach(tab => tab.setAttribute('aria-pressed', String(tab.dataset.category === category)));
  }

  function resetFilters() {
    category = 'all';
    search.value = '';
    layout.value = 'all';
    color.value = 'all';
    sort.value = 'featured';
    renderCatalog();
  }

  function openProject(card) {
    currentCard = card;
    const image = card.querySelector('img');
    document.getElementById('catalogDialogTitle').textContent = title(card);
    document.getElementById('catalogDialogDescription').textContent = card.querySelector('.catalog-description').textContent;
    document.getElementById('catalogDialogImage').src = image.getAttribute('src');
    document.getElementById('catalogDialogImage').alt = image.alt;
    document.getElementById('catalogDialogLayout').textContent = card.dataset.layoutName;
    const kitchen = card.dataset.kind === 'kitchen';
    document.getElementById('catalogDialogComposition').textContent = kitchen
      ? 'Подберём нижние и верхние секции, места для техники и системы хранения. Состав модулей и материалы согласуем под ваши размеры.'
      : 'Подберём секции, полки, ящики и штанги под ваши вещи. Размеры шкафа и внутреннее наполнение согласуем индивидуально.';
    primary.textContent = kitchen ? 'Рассчитать похожую кухню' : 'Обсудить проект по телефону';
    primary.href = kitchen ? '#configurator' : 'tel:+79814340888';
    previousOverflow = document.body.style.overflow;
    dialog.showModal();
    dialog.scrollTop = 0;
    document.body.style.overflow = 'hidden';
  }

  catalog.querySelector('.catalog-controls').hidden = false;
  catalog.querySelector('.catalog-tabs').hidden = false;
  document.getElementById('catalogFilters').hidden = false;
  catalog.dataset.enhanced = '';
  catalog.dataset.filtersOpen = 'false';
  catalog.querySelectorAll('[data-project-open],[data-project-image-open]').forEach(button => button.hidden = false);
  catalog.querySelectorAll('.catalog-fallback').forEach(link => link.hidden = true);

  search.addEventListener('input', renderCatalog);
  [layout, color, sort].forEach(control => control.addEventListener('change', renderCatalog));
  tabs.forEach(tab => tab.addEventListener('click', () => {
    category = tab.dataset.category;
    // A kitchen-only layout must not hide the wardrobe category.
    if (category === 'storage') layout.value = 'all';
    renderCatalog();
  }));
  catalog.querySelectorAll('[data-catalog-reset]').forEach(button => button.addEventListener('click', resetFilters));
  document.getElementById('catalogFilterToggle').addEventListener('click', event => {
    const open = catalog.dataset.filtersOpen !== 'true';
    catalog.dataset.filtersOpen = String(open);
    event.currentTarget.setAttribute('aria-expanded', String(open));
  });
  grid.addEventListener('click', event => {
    const button = event.target.closest('[data-project-open],[data-project-image-open]');
    if (button) openProject(button.closest('.catalog-card'));
  });
  document.getElementById('catalogDialogClose').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => document.body.style.overflow = previousOverflow);
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const controls = dialog.querySelectorAll('button:not([disabled]), a[href]');
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  primary.addEventListener('click', event => {
    if (!currentCard || currentCard.dataset.kind !== 'kitchen') return;
    event.preventDefault();
    const button = document.querySelector(`#layout [data-v="${currentCard.dataset.layout}"]`);
    if (button) button.click();
    const selection = document.getElementById('catalogSelection');
    selection.textContent = `Вы выбрали «${title(currentCard)}». Настройте размеры, материалы и комплектацию для предварительного расчёта похожей кухни.`;
    selection.hidden = false;
    dialog.close();
    const configurator = document.getElementById('configurator');
    configurator.scrollIntoView({behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
    selection.setAttribute('tabindex', '-1');
    selection.focus({preventScroll: true});
  });
  renderCatalog();
})();
