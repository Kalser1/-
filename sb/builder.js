/* САЙТСТРОЙ — редактор: палитра блоков, холст с перетаскиванием,
   инспектор свойств, темы, автосохранение, экспорт и публикация.
   Всё работает локально: ни сети, ни базы данных — только localStorage. */
(function () {
  'use strict';
  var SB = window.SB;
  var KEY = 'sb.projects.v1';
  var uidSeed = 0;

  function uid() {
    uidSeed++;
    return 'b' + Date.now().toString(36) + uidSeed.toString(36) + Math.floor(Math.random() * 1296).toString(36);
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function esc(s) { return SB.esc(s); }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  /* ---------- состояние ---------- */

  var S = {
    projects: {},
    order: [],
    currentId: null,
    sel: null,
    tab: 'blocks',
    device: 'desktop',
    undo: [],
    redo: [],
    dragging: null
  };

  var DEVICES = {
    desktop: { w: 1180, label: 'Десктоп' },
    tablet: { w: 834, label: 'Планшет' },
    mobile: { w: 390, label: 'Телефон' }
  };

  /* ---------- шаблоны ---------- */

  function T(blocks) {
    return blocks.map(function (b) {
      var o = { id: uid(), type: b[0] };
      Object.keys(b[1] || {}).forEach(function (k) { o[k] = b[1][k]; });
      return o;
    });
  }

  var TEMPLATES = [
    {
      id: 'landing', name: 'Лендинг услуги',
      desc: 'Первый экран, преимущества, тарифы, вопросы, контакты',
      blocks: T([
        ['navbar', { brand: 'СТУДИЯ', links: [{ label: 'Услуги', href: '#features' }, { label: 'Цены', href: '#pricing' }, { label: 'Вопросы', href: '#faq' }, { label: 'Контакты', href: '#contacts' }], cta: 'Оставить заявку', ctaHref: '#contacts' }],
        ['hero', { eyebrow: 'Веб-студия', title: 'Сайт, который продаёт за вас', subtitle: 'Разбираем задачу, делаем дизайн и запускаем за две недели. Дальше — работаем над конверсией.', b1: 'Смотреть услуги', b1h: '#features', b2: 'Получить оценку', b2h: '#contacts' }],
        ['features', { title: 'Почему нам доверяют', anchor: 'features', items: [{ title: 'Понятная смета', text: 'Фиксируем цену до старта работ.' }, { title: 'Соблюдаем сроки', text: 'Держим дедлайн или возвращаем предоплату.' }, { title: 'Всегда на связи', text: 'Отвечаем в течение рабочего дня.' }, { title: 'Чистый код', text: 'Никаких конструкторов и вендорных блокировок.' }] }],
        ['cards', { title: 'Что входит в работу', sub: 'Можно взять целиком или по частям', cols: '3', anchor: 'services', items: [{ icon: '🎨', title: 'Дизайн', text: 'Прототип и визуальная система под задачу.' }, { icon: '⚙', title: 'Разработка', text: 'Адаптивная вёрстка и быстрые страницы.' }, { icon: '🚀', title: 'Запуск', text: 'Домен, SSL, аналитика, обучение команды.' }] }],
        ['stats', { items: [{ value: '120+', label: 'проектов' }, { value: '14 дней', label: 'средний срок' }, { value: '4.9', label: 'оценка клиентов' }, { value: '0 ₽', label: 'за поддержку' }] }],
        ['pricing', { title: 'Тарифы', anchor: 'pricing', items: [{ name: 'Старт', price: '30 000 ₽', period: 'от 7 дней', features: 'Один экран\nКонтент и тексты\nДомен и SSL\n2 правки', featured: false, cta: 'Выбрать', href: '#contacts' }, { name: 'Бизнес', price: '75 000 ₽', period: 'от 14 дней', features: 'До 8 блоков\nУникальный стиль\nФормы и CRM\nПравки без лимита', featured: true, cta: 'Обсудить', href: '#contacts' }, { name: 'Масштаб', price: 'от 150 000 ₽', period: 'по проекту', features: 'Интернет-магазин\nЛичный кабинет\nИнтеграции\nПоддержка 24/7', featured: false, cta: 'Обсудить', href: '#contacts' }] }],
        ['cta', { title: 'Обсудим задачу?', text: 'Пришлите вводные — вернёмся с планом и сметой в течение дня.', cta: 'Написать', href: '#contacts' }],
        ['faq', { title: 'Частые вопросы', anchor: 'faq', items: [{ q: 'Работаете с другими городами?', a: 'Да, работаем удалённо по договору.' }, { q: 'Что если нужен нестандартный дизайн?', a: 'Собственный дизайн входит в тариф «Бизнес» и выше.' }, { q: 'Кто владеет сайтом?', a: 'Вы: исходники и репозиторий передаём на руки.' }] }],
        ['contact', { title: 'Контакты', sub: 'Отвечаем в рабочие дни с 10 до 19', anchor: 'contacts', items: [{ icon: '✉', label: 'Почта', value: 'mail@example.com' }, { icon: '✈', label: 'Telegram', value: 'https://t.me/example' }, { icon: '☎', label: 'Телефон', value: '+7 900 000-00-00' }], form: true }],
        ['footer', { text: 'Все права защищены', links: [{ label: 'Telegram', href: 'https://t.me/example' }, { label: 'Политика', href: '#' }] }]
      ])
    },
    {
      id: 'card', name: 'Визитка', desc: 'Кто вы, чем занимаетесь, как связаться',
      blocks: T([
        ['navbar', { brand: 'ИМЯ', links: [{ label: 'Обо мне', href: '#about' }, { label: 'Контакты', href: '#contacts' }], cta: 'Связаться', ctaHref: '#contacts' }],
        ['hero', { eyebrow: 'Фрилансер', title: 'Иван Петров', subtitle: 'Дизайнер интерфейсов и фронтенд-разработчик. Делаю сайты, которые быстро грузятся и удобно читаются.', b1: 'Смотреть работы', b1h: '#works', b2: 'Связаться', b2h: '#contacts', align: 'left', height: 'tall' }],
        ['text', { text: 'Десять лет в вебе: от лендингов до сложных сервисов. Люблю чистый код, понятные интерфейсы и проекты, которыми не стыдно поделиться.', anchor: 'about' }],
        ['gallery', { title: 'Избранные работы', anchor: 'works', cols: '3', items: [{ src: '', caption: 'Проект 1' }, { src: '', caption: 'Проект 2' }, { src: '', caption: 'Проект 3' }] }],
        ['quote', { text: 'Работал с Иваном над редизайном — результат превзошёл ожидания, а сроки сдвинулись всего на два дня.', author: 'Мария Соколова', role: 'продукт-менеджер' }],
        ['contact', { title: 'Связаться со мной', anchor: 'contacts', items: [{ icon: '✈', label: 'Telegram', value: 'https://t.me/example' }, { icon: '✉', label: 'Почта', value: 'mail@example.com' }], form: false }],
        ['footer', { text: '© Работа с любовью' }]
      ])
    },
    {
      id: 'shop', name: 'Товары', desc: 'Каталог с карточками и ценами',
      blocks: T([
        ['navbar', { brand: 'МАРКЕТ', links: [{ label: 'Каталог', href: '#catalog' }, { label: 'Доставка', href: '#faq' }, { label: 'Контакты', href: '#contacts' }] }],
        ['hero', { eyebrow: 'Новая коллекция', title: 'Вещи, которые живут долго', subtitle: 'Небольшие партии, честные материалы и цена без наценок посредников.', b1: 'Смотреть каталог', b1h: '#catalog', b2: 'Условия доставки', b2h: '#faq' }],
        ['cards', { title: 'Каталог', anchor: 'catalog', cols: '3', items: [{ icon: '🧢', title: 'Кепка «Ночь»', text: '9 900 ₽ · хлопок, плотность 320 г/м²' }, { icon: '🧣', title: 'Шарф «Графит»', text: '4 500 ₽ · шерсть и акрил' }, { icon: '👟', title: 'Ботинки «Тайга»', text: '21 000 ₽ · кожа, ручная подошва' }] }],
        ['features', { title: 'Как мы работаем', items: [{ title: 'Своё производство', text: 'Небольшие партии без переплат.' }, { title: 'Честная цена', text: 'Считаем от себестоимости.' }, { title: 'Быстрая доставка', text: 'По России 2–5 дней.' }, { title: 'Возврат', text: '30 дней без вопросов.' }] }],
        ['faq', { title: 'Вопросы', anchor: 'faq', items: [{ q: 'Как оформить заказ?', a: 'Напишите в Telegram или заполните форму — уточним размер и цвет.' }, { q: 'Есть ли скидки?', a: 'Да, от пяти единиц — 10%.' }] }],
        ['contact', { title: 'Связаться', anchor: 'contacts', items: [{ icon: '✈', label: 'Telegram', value: 'https://t.me/example' }], form: true }],
        ['footer', { text: '© Все права защищены' }]
      ])
    },
    {
      id: 'info', name: 'Страница услуги', desc: 'Справочная страница: текст, разделитель, вопросы',
      blocks: T([
        ['navbar', { brand: 'СЕРВИС', links: [{ label: 'Об услуге', href: '#about' }, { label: 'Вопросы', href: '#faq' }] }],
        ['hero', { title: 'Описание услуги', subtitle: 'Коротко о сути, о выгоде и о том, как начать.', b1: 'Оставить заявку', b1h: '#contacts' }],
        ['text', { anchor: 'about', text: 'Раздел для описания. Пишите обычным текстом, поддерживается **разметка**: *курсив*, `код`, [ссылки](https://github.com) и переносы строк.' }],
        ['divider', { label: 'Важно' }],
        ['faq', { title: 'Частые вопросы', anchor: 'faq', items: [{ q: 'Вопрос?', a: 'Ответ.' }] }],
        ['contact', { title: 'Готовы начать?', anchor: 'contacts', items: [{ icon: '✉', label: 'Почта', value: 'mail@example.com' }], form: false }],
        ['footer', { text: 'Сделано с заботой' }]
      ])
    },
    {
      id: 'blank', name: 'С чистого листа', desc: 'Пустая страница и полная свобода',
      blocks: T([])
    }
  ];

  function newProject(title) {
    return {
      id: uid(),
      title: title || 'Новый сайт',
      description: '',
      lang: 'ru',
      theme: SB.newTheme(),
      blocks: [],
      updated: Date.now()
    };
  }

  function fromTemplate(id) {
    var t = TEMPLATES.find(function (x) { return x.id === id; });
    var p = newProject(t.name);
    p.blocks = JSON.parse(JSON.stringify(t.blocks)).map(function (b) { b.id = uid(); return b; });
    p.description = t.desc;
    if (id === 'landing') {
      var pal = Object.keys(SB.ACCENTS);
      var a = SB.ACCENTS[pal[Math.floor(Math.random() * pal.length)]];
      p.theme.accent = a[0];
      p.theme.accent2 = a[1];
      p.theme.radius = 18;
    }
    return p;
  }

  /* ---------- хранение ---------- */

  function loadStore() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (!data || !data.projects) return;
      S.projects = data.projects;
      S.order = (data.order || Object.keys(data.projects)).filter(function (id) { return data.projects[id]; });
      S.currentId = data.current && data.projects[data.current] ? data.current : S.order[0];
    } catch (e) {
      S.projects = {};
      S.order = [];
    }
  }

  var saveTimer = null;
  function saveStore() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveStoreNow, 400);
  }

  function saveStoreNow() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    try {
      localStorage.setItem(KEY, JSON.stringify({ projects: S.projects, order: S.order, current: S.currentId }));
      return true;
    } catch (e) {
      toast('Не удалось сохранить: хранилище браузера переполнено. Уберите картинки-файлы или удалите лишние проекты.', 'bad');
      return false;
    }
  }

  function project() { return S.projects[S.currentId]; }

  function ensureProject() {
    if (!S.currentId || !project()) {
      var p = fromTemplate('landing');
      S.projects[p.id] = p;
      S.order.unshift(p.id);
      S.currentId = p.id;
      saveStore();
    }
    return project();
  }

  /* ---------- история: снимок снимается ДО изменения ---------- */

  function snapshot() {
    var p = project();
    if (!p) return;
    S.undo.push(JSON.stringify({ title: p.title, description: p.description, theme: p.theme, blocks: p.blocks }));
    if (S.undo.length > 60) S.undo.shift();
    S.redo.length = 0;
    updateHistoryButtons();
  }

  var lastMark = 0;
  function mark(force) {
    var now = Date.now();
    if (force || now - lastMark > 700) {
      snapshot();
      lastMark = now;
    }
  }

  /* opts: { full:false — не перерисовывать всё, silent — без сообщения } */
  function commit(opts) {
    opts = opts || {};
    var p = project();
    if (!p) return;
    p.updated = Date.now();
    saveStore();
    renderTopbar();
    updateStatus();
    if (opts.full !== false) {
      applyStyles();
      renderCanvas();
      renderInspector();
      renderLayersIfActive();
    }
  }

  function restore(json) {
    var p = project();
    if (!p) return;
    var d = JSON.parse(json);
    ['title', 'description', 'theme', 'blocks'].forEach(function (k) { p[k] = d[k]; });
    p.updated = Date.now();
    saveStore();
    renderTopbar();
    render();
    updateHistoryButtons();
  }

  function stateOf() {
    var p = project();
    return JSON.stringify({ title: p.title, description: p.description, theme: p.theme, blocks: p.blocks });
  }

  function undo() {
    if (!S.undo.length) return;
    S.redo.push(stateOf());
    restore(S.undo.pop());
  }

  function redo() {
    if (!S.redo.length) return;
    S.undo.push(stateOf());
    restore(S.redo.pop());
  }

  function updateHistoryButtons() {
    var u = $('#btnUndo');
    var r = $('#btnRedo');
    if (u) u.disabled = !S.undo.length;
    if (r) r.disabled = !S.redo.length;
  }

  /* ---------- операции с блоками ---------- */

  function blockIndex(id) {
    return project().blocks.findIndex(function (b) { return b.id === id; });
  }
  function blockById(id) {
    return project().blocks.find(function (b) { return b.id === id; });
  }

  function addBlock(type, at) {
    var p = ensureProject();
    var def = SB.blockByType(type);
    if (!def) return null;
    mark(true);
    var b = SB.cloneDefaults(type);
    b.id = uid();
    b.type = type;
    var idx = at == null ? p.blocks.length : clamp(at, 0, p.blocks.length);
    p.blocks.splice(idx, 0, b);
    S.sel = b.id;
    commit();
    return b;
  }

  function removeBlock(id) {
    var p = project();
    var i = blockIndex(id);
    if (i < 0) return;
    mark(true);
    var name = (SB.blockByType(p.blocks[i].type) || {}).name || 'Блок';
    p.blocks.splice(i, 1);
    if (S.sel === id) {
      var next = p.blocks[Math.min(i, p.blocks.length - 1)];
      S.sel = next ? next.id : null;
    }
    commit();
    toast('Блок «' + name + '» удалён', 'ok');
  }

  function duplicateBlock(id) {
    var p = project();
    var i = blockIndex(id);
    if (i < 0) return;
    mark(true);
    var copy = JSON.parse(JSON.stringify(p.blocks[i]));
    copy.id = uid();
    p.blocks.splice(i + 1, 0, copy);
    S.sel = copy.id;
    commit();
  }

  function moveBlock(id, to) {
    var p = project();
    var from = blockIndex(id);
    if (from < 0) return;
    var target = clamp(to, 0, p.blocks.length - 1);
    if (from === target) return;
    mark(true);
    var b = p.blocks.splice(from, 1)[0];
    p.blocks.splice(target, 0, b);
    commit();
  }

  function moveBlockBy(id, dir) {
    moveBlock(id, blockIndex(id) + dir);
  }

  /* ---------- холст ---------- */

  var deviceBox, deviceFit, stageScroll, canvasPage, styleTag;
  var canvasTimer = null;

  function renderCanvas() {
    var p = project();
    if (!p) return;
    canvasPage.innerHTML = renderShells(p.blocks);
    deviceBox.style.width = DEVICES[S.device].w + 'px';
    fitCanvas();
    updateStatus();
  }

  /* Превью всегда показывает настоящую ширину устройства: если рабочая
     область уже, вписываем кадр через transform — container queries
     при этом считают реальные пиксели, поэтому мобильная вёрстка на
     превью остаётся по-настоящему мобильной. */
  function fitCanvas() {
    if (!deviceFit || !stageScroll) return;
    var w = DEVICES[S.device].w;
    var cs = getComputedStyle(stageScroll);
    var avail = stageScroll.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    var k = avail > 0 && w > avail ? avail / w : 1;
    deviceBox.style.transform = k < 1 ? 'scale(' + k.toFixed(4) + ')' : '';
    deviceFit.style.width = Math.round(w * k) + 'px';
    deviceFit.style.height = Math.round(deviceBox.offsetHeight * k) + 'px';
  }

  /* при вводе текста холст перерисовываем не чаще раза в 120 мс:
     иначе каждая буква пересобирает innerHTML со вшитыми картинками */
  function renderCanvasSoon() {
    if (canvasTimer) return;
    canvasTimer = setTimeout(function () {
      canvasTimer = null;
      renderCanvas();
    }, 120);
  }

  function renderShells(blocks) {
    if (!blocks.length) {
      return '<div class="sb-edit-empty"><b>Здесь пока пусто</b>' +
        '<p>Перетащите блок из левой панели или нажмите на нём — добавится в конец страницы.</p></div>' +
        '<div class="sb-edit-tail" data-drop="end"></div>';
    }
    return blocks.map(function (b) {
      var def = SB.blockByType(b.type);
      return '<div class="sb-edit-block' + (S.sel === b.id ? ' sb-sel' : '') + '" data-id="' + b.id + '" draggable="true">' +
        '<div class="sb-edit-tools" contenteditable="false">' +
          '<span class="sb-edit-tag">' + esc(def ? def.name : b.type) + '</span>' +
          '<button type="button" data-act="up" title="Выше">↑</button>' +
          '<button type="button" data-act="down" title="Ниже">↓</button>' +
          '<button type="button" data-act="dup" title="Дублировать">⧉</button>' +
          '<button type="button" data-act="del" title="Удалить">✕</button>' +
        '</div>' +
        '<div class="sb-edit-content">' + SB.renderBlocks([b], project()) + '</div>' +
        '</div>';
    }).join('') + '<div class="sb-edit-tail" data-drop="end"></div>';
  }

  function applyStyles() {
    styleTag.textContent = SB.scopeCSS(SB.themeCSS(project().theme), '.sb-canvas');
  }

  /* ---------- левая панель ---------- */

  function renderPalette() {
    var groups = [];
    SB.BLOCKS.forEach(function (b) {
      var g = groups.find(function (x) { return x.name === b.group; });
      if (!g) groups.push(g = { name: b.group, items: [] });
      g.items.push(b);
    });
    var html = '<p class="sb-rail-note">Перетащите блок на страницу или нажмите — добавится в конец.</p>';
    return html + groups.map(function (g) {
      return '<h4 class="sb-rail-h">' + esc(g.name) + '</h4><div class="sb-chips">' +
        g.items.map(function (b) {
          return '<button type="button" class="sb-chip" draggable="true" data-type="' + b.type +
            '" title="' + esc(b.desc) + '"><span class="sb-chip-ico">' + esc(b.icon) +
            '</span><span>' + esc(b.name) + '</span></button>';
        }).join('') + '</div>';
    }).join('');
  }

  function renderLayers() {
    var p = project();
    if (!p.blocks.length) return '<p class="sb-rail-note">Блоков пока нет. Возьмите их на вкладке «Блоки».</p>';
    return '<p class="sb-rail-note">Порядок сверху вниз — как на странице. Перетащите строку или используйте стрелки.</p>' +
      '<ul class="sb-layers">' + p.blocks.map(function (b, i) {
        var def = SB.blockByType(b.type);
        return '<li class="sb-layer' + (S.sel === b.id ? ' sb-on' : '') + '" data-id="' + b.id + '" draggable="true">' +
          '<span class="sb-layer-ico">' + esc(def ? def.icon : '?') + '</span>' +
          '<span class="sb-layer-name">' + esc(def ? def.name : b.type) + '</span>' +
          '<span class="sb-layer-n">' + (i + 1) + '</span>' +
          '<button type="button" data-act="up" title="Выше">↑</button>' +
          '<button type="button" data-act="down" title="Ниже">↓</button>' +
          '<button type="button" data-act="del" title="Удалить">✕</button>' +
          '</li>';
      }).join('') + '</ul>';
  }

  function renderThemeTab() {
    return '<p class="sb-rail-note">Цвета, шрифты и отступы меняются в правой панели — нажмите «Настройки сайта».</p>' +
      '<button type="button" class="sb-mini" data-site-sel="1">Открыть настройки сайта</button>' +
      '<h4 class="sb-rail-h">Палитры</h4><div class="sb-swatches">' +
      Object.keys(SB.ACCENTS).map(function (k) {
        var a = SB.ACCENTS[k];
        return '<button type="button" class="sb-swatch" data-acc="' + k + '" title="' + k +
          '" style="background:linear-gradient(135deg,' + a[0] + ',' + a[1] + ')"></button>';
      }).join('') + '</div>' +
      '<h4 class="sb-rail-h">Готовые сочетания</h4><div class="sb-chips">' +
      [['Светлая', { dark: false }], ['Тёмная', { dark: true }]].map(function (x) {
        return '<button type="button" class="sb-chip" data-preset="' + x[0] + '">' +
          '<span class="sb-chip-ico">' + (x[1].dark ? '☾' : '☀') + '</span><span>' + x[0] + '</span></button>';
      }).join('') + '</div>';
  }

  /* ---------- инспектор ---------- */

  function fieldEditor(owner, f, value, path) {
    var p = esc(path.join('.'));
    var v = value == null ? '' : value;

    if (f.type === 'bool') {
      return '<label class="sb-switch"><input type="checkbox" data-path="' + p + '"' + (v ? ' checked' : '') +
        '><span class="sb-track"></span><span class="sb-switch-l">' + esc(f.label) + '</span></label>';
    }

    if (f.type === 'select') {
      return '<label class="sb-field"><span class="sb-fl">' + esc(f.label) + '</span><select data-path="' + p + '">' +
        f.options.map(function (o, i) {
          return '<option value="' + esc(o) + '"' + (String(v) === o ? ' selected' : '') + '>' +
            esc((f.labels && f.labels[i]) || o) + '</option>';
        }).join('') + '</select></label>';
    }

    if (f.type === 'align') {
      var marks = { left: '⇤', center: '↔', right: '⇥' };
      return '<div class="sb-field"><span class="sb-fl">' + esc(f.label) + '</span><div class="sb-seg">' +
        ['left', 'center', 'right'].map(function (a) {
          return '<button type="button" data-align="' + a + '" data-path="' + p + '"' +
            (v === a ? ' class="on"' : '') + '>' + marks[a] + '</button>';
        }).join('') + '</div></div>';
    }

    if (f.type === 'number') {
      return '<label class="sb-field"><span class="sb-fl">' + esc(f.label) +
        ' <b data-out="' + p + '">' + esc(v) + '</b></span>' +
        '<input type="range" data-path="' + p + '" min="' + (f.min != null ? f.min : 0) +
        '" max="' + (f.max != null ? f.max : 100) + '" step="' + (f.step || 1) + '" value="' + esc(v) + '"></label>';
    }

    if (f.type === 'color') {
      return '<label class="sb-field"><span class="sb-fl">' + esc(f.label) + '</span>' +
        '<span class="sb-color"><input type="color" data-path="' + p + '" value="' +
        esc(/^#[0-9a-fA-F]{6}$/.test(v) ? v : '#000000') + '">' +
        '<input type="text" class="sb-hex" data-path="' + p + '" value="' + esc(v) + '" spellcheck="false"></span></label>';
    }

    if (f.type === 'textarea') {
      return '<label class="sb-field"><span class="sb-fl">' + esc(f.label) + '</span>' +
        '<textarea data-path="' + p + '" rows="' + (f.rows || 4) + '" spellcheck="false">' + esc(v) + '</textarea></label>';
    }

    if (f.type === 'image') {
      return '<div class="sb-field"><span class="sb-fl">' + esc(f.label) + '</span>' +
        '<div class="sb-imgpick">' +
        (v ? '<img src="' + esc(v) + '" alt="">' : '<div class="sb-imgpick-empty">нет картинки</div>') +
        '<div class="sb-imgpick-btns">' +
        '<button type="button" class="sb-mini" data-upload="' + p + '">Из файла…</button>' +
        (v ? '<button type="button" class="sb-mini sb-mini-bad" data-clear="' + p + '">Убрать</button>' : '') +
        '</div></div>' +
        '<input type="text" data-path="' + p + '" value="' + esc(v) +
        '" placeholder="https://… или images/photo.jpg" spellcheck="false"></div>';
    }

    if (f.type === 'url') {
      return '<label class="sb-field"><span class="sb-fl">' + esc(f.label) + '</span>' +
        '<input type="text" data-path="' + p + '" value="' + esc(v) +
        '" placeholder="https://… или #якорь" spellcheck="false"></label>';
    }

    if (f.type === 'links') {
      var links = Array.isArray(v) ? v : [];
      return '<div class="sb-field"><span class="sb-fl">' + esc(f.label) + ' <em>' + links.length + '</em></span>' +
        '<ul class="sb-rows">' + links.map(function (it, i) {
          return '<li class="sb-row">' +
            '<input type="text" data-path="' + p + '.' + i + '.label" value="' + esc(it.label || '') + '" placeholder="Название">' +
            '<input type="text" data-path="' + p + '.' + i + '.href" value="' + esc(it.href || '') + '" placeholder="https://… или #anchor">' +
            '<button type="button" class="sb-x" data-listdel="' + esc(f.k) + '" data-i="' + i + '" title="Убрать">✕</button></li>';
        }).join('') + '</ul>' +
        '<button type="button" class="sb-mini" data-listadd="' + esc(f.k) + '">+ добавить пункт</button></div>';
    }

    if (f.type === 'list') {
      var arr = Array.isArray(v) ? v : [];
      return '<div class="sb-field"><span class="sb-fl">' + esc(f.label) + ' <em>' + arr.length + '</em></span>' +
        '<ul class="sb-rows">' + arr.map(function (it, i) {
          return '<li class="sb-row-box sb-row">' +
            '<div class="sb-row-head"><b>' + esc(f.itemLabel || 'Элемент') + ' ' + (i + 1) + '</b>' +
            '<span class="sb-row-btns">' +
            '<button type="button" data-listup="' + esc(f.k) + '" data-i="' + i + '" title="Выше">↑</button>' +
            '<button type="button" data-listdup="' + esc(f.k) + '" data-i="' + i + '" title="Дублировать">⧉</button>' +
            '<button type="button" class="sb-x" data-listdel="' + esc(f.k) + '" data-i="' + i + '" title="Убрать">✕</button>' +
            '</span></div>' +
            f.of.map(function (sub) {
              return fieldEditor(it, { label: sub.label, type: sub.type, options: sub.options, labels: sub.labels,
                rows: sub.rows, min: sub.min, max: sub.max, step: sub.step }, it[sub.k], path.concat(i + '.' + sub.k));
            }).join('') +
            '</li>';
        }).join('') + '</ul>' +
        '<button type="button" class="sb-mini" data-listadd="' + esc(f.k) + '">+ ' + esc(f.itemLabel || 'добавить') + '</button></div>';
    }

    return '<label class="sb-field"><span class="sb-fl">' + esc(f.label) + '</span>' +
      '<input type="text" data-path="' + p + '" value="' + esc(v) + '" spellcheck="false"></label>';
  }

  function setPath(obj, path, value) {
    var keys = path.split('.');
    var last = keys.pop();
    var cur = obj;
    for (var i = 0; i < keys.length; i++) {
      if (cur[keys[i]] == null) cur[keys[i]] = /^\d+$/.test(keys[i + 1]) ? [] : {};
      cur = cur[keys[i]];
      if (cur == null) return;
    }
    cur[last] = value;
  }

  function getPath(obj, path) {
    return path.split('.').reduce(function (a, k) { return a == null ? a : a[k]; }, obj);
  }

  function renderInspector() {
    var p = project();
    var head = $('#inspHead');
    var box = $('#inspector');
    var b = S.sel ? blockById(S.sel) : null;

    $('#siteSel').classList.toggle('on', !b);

    if (!b) {
      head.innerHTML = '<b>Страница</b><span>общие настройки сайта</span>';
      box.innerHTML = siteFields(p);
      return;
    }

    var def = SB.blockByType(b.type);
    var idx = blockIndex(b.id);
    head.innerHTML = '<b>' + esc(def ? def.name : b.type) + '</b><span>блок ' + (idx + 1) + ' из ' + p.blocks.length + '</span>';

    var html = '<div class="sb-insp-actions">' +
      '<button type="button" class="sb-mini" data-bact="up"' + (idx === 0 ? ' disabled' : '') + '>↑ Выше</button>' +
      '<button type="button" class="sb-mini" data-bact="down"' + (idx === p.blocks.length - 1 ? ' disabled' : '') + '>↓ Ниже</button>' +
      '<button type="button" class="sb-mini" data-bact="dup">⧉ Копия</button>' +
      '<button type="button" class="sb-mini sb-mini-bad" data-bact="del">✕ Удалить</button>' +
      '</div>';

    (def ? def.fields : []).forEach(function (f) {
      html += fieldEditor(b, f, b[f.k], [f.k]);
    });

    box.innerHTML = html + '<p class="sb-insp-tip">Esc — вернуться к настройкам сайта</p>';
  }

  function siteFields(p) {
    var t = p.theme;
    var html = '<div class="sb-insp-group"><h5>Название и SEO</h5>' +
      '<label class="sb-field"><span class="sb-fl">Заголовок вкладки</span>' +
      '<input type="text" data-meta="title" value="' + esc(p.title) + '" spellcheck="false"></label>' +
      '<label class="sb-field"><span class="sb-fl">Описание для поиска и соцсетей</span>' +
      '<textarea data-meta="description" rows="3">' + esc(p.description) + '</textarea></label></div>';

    html += '<div class="sb-insp-group"><h5>Цвета</h5><div class="sb-swatches">' +
      Object.keys(SB.ACCENTS).map(function (k) {
        var a = SB.ACCENTS[k];
        return '<button type="button" class="sb-swatch' + (t.accent.toLowerCase() === a[0].toLowerCase() ? ' on' : '') +
          '" data-acc="' + k + '" title="' + k + '" style="background:linear-gradient(135deg,' + a[0] + ',' + a[1] + ')"></button>';
      }).join('') + '</div>' +
      fieldEditor(t, { label: 'Основной цвет', type: 'color' }, t.accent, ['accent']) +
      fieldEditor(t, { label: 'Второй цвет (градиент)', type: 'color' }, t.accent2, ['accent2']) +
      '<label class="sb-switch"><input type="checkbox" data-tflag="dark"' + (t.dark ? ' checked' : '') +
      '><span class="sb-track"></span><span class="sb-switch-l">Тёмная тема</span></label></div>';

    html += '<div class="sb-insp-group"><h5>Вид</h5>' +
      fieldEditor(t, { label: 'Шрифт', type: 'select', options: ['sans', 'serif', 'mono', 'rounded'],
        labels: ['Без засечек', 'С засечками', 'Моноширинный', 'Скруглённый'] }, t.font, ['font']) +
      fieldEditor(t, { label: 'Скругление углов', type: 'number', min: 0, max: 34, step: 1 }, t.radius, ['radius']) +
      fieldEditor(t, { label: 'Ширина страницы', type: 'number', min: 820, max: 1440, step: 20 }, t.container, ['container']) +
      fieldEditor(t, { label: 'Отступы между блоками', type: 'number', min: 28, max: 140, step: 4 }, t.gap, ['gap']) +
      '<label class="sb-switch"><input type="checkbox" data-tflag="shadows"' + (t.shadows === false ? '' : ' checked') +
      '><span class="sb-track"></span><span class="sb-switch-l">Тени у карточек</span></label>' +
      '<label class="sb-switch"><input type="checkbox" data-tflag="reveal"' + (t.reveal === false ? '' : ' checked') +
      '><span class="sb-track"></span><span class="sb-switch-l">Анимация появления</span></label></div>';

    return html;
  }

  /* ---------- общий рендер ---------- */

  function render() {
    var p = project();
    if (!p) return;
    applyStyles();
    $('#railBody').innerHTML = S.tab === 'blocks' ? renderPalette() : S.tab === 'layers' ? renderLayers() : renderThemeTab();
    renderCanvas();
    renderInspector();
    updateStatus();
  }

  function renderLayersIfActive() {
    if (S.tab === 'layers') $('#railBody').innerHTML = renderLayers();
  }

  function renderTopbar() {
    var p = project();
    if (!p) return;
    var ti = $('#projTitle');
    if (document.activeElement !== ti) ti.value = p.title;
    $('#projList').innerHTML = S.order.map(function (id) {
      var pr = S.projects[id];
      if (!pr) return '';
      return '<option value="' + id + '"' + (id === S.currentId ? ' selected' : '') + '>' + esc(pr.title) + '</option>';
    }).join('');
  }

  function updateStatus() {
    var p = project();
    if (!p) return;
    var bytes = 0;
    try { bytes = new Blob([JSON.stringify(p)]).size; } catch (e) { bytes = JSON.stringify(p).length; }
    $('#status').textContent = p.blocks.length + ' бл. · ' + DEVICES[S.device].label + ' · ' +
      (bytes > 1024 ? Math.round(bytes / 1024) + ' КБ' : bytes + ' Б');
  }

  function toast(msg, kind) {
    var wrap = $('#toasts');
    var el = document.createElement('div');
    el.className = 'sb-toast ' + (kind || '');
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(function () {
      el.classList.add('out');
      setTimeout(function () { if (el.parentNode) el.remove(); }, 300);
    }, 3400);
  }

  /* ---------- холст: события ---------- */

  function dragKind(e) {
    var t = (e.dataTransfer && e.dataTransfer.getData('text/plain')) || '';
    if (t.indexOf('sb-new:') === 0) return { kind: 'new', type: t.slice(6) };
    if (t.indexOf('sb-move:') === 0) return { kind: 'move', id: t.slice(8) };
    return null;
  }

  function clearMarks(root) {
    var m = root.querySelectorAll('.sb-over');
    for (var i = 0; i < m.length; i++) m[i].classList.remove('sb-over', 'sb-over-after');
  }

  function dropTargetFor(e) {
    var node = e.target;
    while (node && node !== canvasPage) {
      if (node.classList) {
        if (node.classList.contains('sb-edit-block')) {
          var r = node.getBoundingClientRect();
          return { node: node, tail: false, after: e.clientY > r.top + r.height / 2 };
        }
        if (node.classList.contains('sb-edit-tail')) return { node: node, tail: true, after: true };
      }
      node = node.parentNode;
    }
    return null;
  }

  function setupCanvasEvents() {
    canvasPage.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('.sb-edit-tools button');
      if (btn) {
        var host = btn.closest('.sb-edit-block');
        var id = host && host.dataset.id;
        if (!id) return;
        e.preventDefault();
        e.stopPropagation();
        if (btn.dataset.act === 'up') moveBlockBy(id, -1);
        else if (btn.dataset.act === 'down') moveBlockBy(id, 1);
        else if (btn.dataset.act === 'dup') duplicateBlock(id);
        else if (btn.dataset.act === 'del') removeBlock(id);
        return;
      }
      var block = e.target.closest && e.target.closest('.sb-edit-block');
      if (block) {
        S.sel = block.dataset.id;
        renderCanvas();
        renderInspector();
        renderLayersIfActive();
      }
    });

    canvasPage.addEventListener('dragstart', function (e) {
      var block = e.target.closest ? e.target.closest('.sb-edit-block') : null;
      if (!block) return;
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', 'sb-move:' + block.dataset.id); } catch (err) {}
      S.dragging = { kind: 'move', id: block.dataset.id };
      block.classList.add('sb-drag');
    });

    canvasPage.addEventListener('dragend', function () {
      var d = canvasPage.querySelector('.sb-drag');
      if (d) d.classList.remove('sb-drag');
      clearMarks(canvasPage);
      S.dragging = null;
    });

    canvasPage.addEventListener('dragover', function (e) {
      var d = S.dragging || dragKind(e);
      if (!d) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = d.kind === 'move' ? 'move' : 'copy';
      clearMarks(canvasPage);
      var t = dropTargetFor(e);
      if (!t) return;
      if (t.tail) t.node.classList.add('sb-over-after');
      else {
        t.node.classList.add('sb-over');
        if (t.after) t.node.classList.add('sb-over-after');
      }
    });

    canvasPage.addEventListener('drop', function (e) {
      var d = S.dragging || dragKind(e);
      if (!d) return;
      e.preventDefault();
      var blocks = project().blocks;
      var t = dropTargetFor(e);
      var at;
      if (!t || t.tail) at = blocks.length;
      else at = blockIndex(t.node.dataset.id) + (t.after ? 1 : 0);

      if (d.kind === 'new') {
        addBlock(d.type, at);
      } else {
        var from = blockIndex(d.id);
        if (from >= 0) {
          if (at > from) at--;
          if (at !== from) moveBlock(d.id, at);
        }
      }
      clearMarks(canvasPage);
      S.dragging = null;
    });

    /* перетаскивание палитры: источник вне холста, подсветку даём сами */
    var rail = $('#railBody');
    rail.addEventListener('dragstart', function (e) {
      var chip = e.target.closest && e.target.closest('.sb-chip');
      if (!chip) return;
      e.dataTransfer.effectAllowed = 'copy';
      try { e.dataTransfer.setData('text/plain', 'sb-new:' + chip.dataset.type); } catch (err) {}
      S.dragging = { kind: 'new', type: chip.dataset.type };
    });
    rail.addEventListener('dragend', function () {
      clearMarks(canvasPage);
      S.dragging = null;
    });
  }

  /* ---------- левая панель: события ---------- */

  function setupRailEvents() {
    var rail = $('#railBody');

    rail.addEventListener('click', function (e) {
      var chip = e.target.closest('.sb-chip');
      if (chip && chip.dataset.type) {
        addBlock(chip.dataset.type);
        return;
      }

      var preset = e.target.closest('[data-preset]');
      if (preset) {
        var t = project().theme;
        mark(true);
        t.dark = preset.dataset.preset === 'Тёмная';
        if (!t.dark) {
          t.bg = '#ffffff'; t.bgSoft = '#f4f6fb'; t.surface = '#ffffff';
          t.text = '#101319'; t.muted = '#5b6478'; t.border = 'rgba(10,15,30,.12)';
        } else {
          t.bg = '#0a0b10'; t.bgSoft = '#0f1118'; t.surface = '#141722';
          t.text = '#eef1f7'; t.muted = '#98a1b3'; t.border = 'rgba(255,255,255,.10)';
        }
        commit();
        return;
      }

      var sw = e.target.closest('[data-acc]');
      if (sw) {
        mark(true);
        var a = SB.ACCENTS[sw.dataset.acc];
        project().theme.accent = a[0];
        project().theme.accent2 = a[1];
        commit();
        return;
      }

      if (e.target.closest('[data-site-sel]')) {
        S.sel = null;
        renderCanvas();
        renderInspector();
        return;
      }

      var act = e.target.closest('.sb-layer [data-act]');
      if (act) {
        var li = act.closest('.sb-layer');
        if (li) {
          var id = li.dataset.id;
          if (act.dataset.act === 'up') moveBlockBy(id, -1);
          else if (act.dataset.act === 'down') moveBlockBy(id, 1);
          else if (act.dataset.act === 'del') removeBlock(id);
        }
        return;
      }

      var layer = e.target.closest('.sb-layer');
      if (layer) {
        S.sel = layer.dataset.id;
        renderCanvas();
        renderInspector();
        $('#railBody').innerHTML = renderLayers();
      }
    });

    rail.addEventListener('dragstart', function (e) {
      var li = e.target.closest('.sb-layer');
      if (!li) return;
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', 'sb-move:' + li.dataset.id); } catch (err) {}
      S.dragging = { kind: 'move', id: li.dataset.id };
      li.classList.add('sb-drag');
    });

    rail.addEventListener('dragover', function (e) {
      if (!S.dragging || S.dragging.kind !== 'move') return;
      e.preventDefault();
      clearMarks(rail);
      var li = e.target.closest('.sb-layer');
      if (li) {
        li.classList.add('sb-over');
        var r = li.getBoundingClientRect();
        if (e.clientY > r.top + r.height / 2) li.classList.add('sb-over-after');
      }
    });

    rail.addEventListener('drop', function (e) {
      if (!S.dragging || S.dragging.kind !== 'move') return;
      e.preventDefault();
      var from = blockIndex(S.dragging.id);
      var li = e.target.closest('.sb-layer');
      if (from >= 0) {
        var at;
        if (li) {
          at = blockIndex(li.dataset.id);
          var r = li.getBoundingClientRect();
          if (e.clientY <= r.top + r.height / 2) at -= 1;
        } else at = project().blocks.length - 1;
        if (at > from) at--;
        moveBlock(S.dragging.id, at);
      }
      S.dragging = null;
    });

    rail.addEventListener('dragend', function () {
      var all = rail.querySelectorAll('.sb-layer');
      for (var i = 0; i < all.length; i++) all[i].classList.remove('sb-drag', 'sb-over', 'sb-over-after');
      S.dragging = null;
    });
  }

  /* ---------- инспектор: события ---------- */

  /* к чему относится правка: выбранному блоку или теме сайта */
  function target() {
    var p = project();
    return S.sel ? blockById(S.sel) : p.theme;
  }

  function setupInspectorEvents() {
    var box = $('#inspector');

    box.addEventListener('input', function (e) {
      var t = e.target;
      var p = project();
      if (!t.dataset.path && !t.dataset.meta && !t.dataset.tflag) return;

      mark();
      var obj = target();
      if (!obj) return;

      if (t.dataset.meta) {
        p[t.dataset.meta] = t.value;
        renderTopbar();
        commit({ full: false });
        return;
      }

      if (t.dataset.tflag) {
        p.theme[t.dataset.tflag] = t.checked;
        commit({ full: false });
        applyStyles();
        renderCanvasSoon();
        return;
      }

      var path = t.dataset.path;
      var value = t.type === 'checkbox' ? t.checked : t.type === 'range' ? Number(t.value) : t.value;
      setPath(obj, path, value);

      var out = box.querySelector('[data-out="' + path + '"]');
      if (out) out.textContent = t.value;

      /* у полей-цветов держим два контрола синхронными, не перерисовывая панель */
      if (t.type === 'color' && t.parentNode) {
        var twin = t.parentNode.querySelector('.sb-hex');
        if (twin) twin.value = t.value;
      }
      if (t.classList.contains('sb-hex')) {
        var sw = t.parentNode && t.parentNode.querySelector('input[type=color]');
        if (sw && /^#[0-9a-fA-F]{6}$/.test(t.value)) sw.value = t.value;
      }

      commit({ full: false });
      renderCanvasSoon();
    });

    box.addEventListener('click', function (e) {
      var b = S.sel ? blockById(S.sel) : null;

      var sw = e.target.closest('[data-acc]');
      if (sw) {
        mark(true);
        var a = SB.ACCENTS[sw.dataset.acc];
        project().theme.accent = a[0];
        project().theme.accent2 = a[1];
        commit();
        return;
      }

      var bact = e.target.closest('[data-bact]');
      if (bact && b) {
        if (bact.dataset.bact === 'up') moveBlockBy(b.id, -1);
        if (bact.dataset.bact === 'down') moveBlockBy(b.id, 1);
        if (bact.dataset.bact === 'dup') duplicateBlock(b.id);
        if (bact.dataset.bact === 'del') removeBlock(b.id);
        return;
      }

      var al = e.target.closest('[data-align]');
      if (al && b) {
        mark(true);
        setPath(b, al.dataset.path, al.dataset.align);
        commit();
        return;
      }

      var add = e.target.closest('[data-listadd]');
      if (add && b) {
        var key = add.dataset.listadd;
        mark(true);
        var def = SB.blockByType(b.type);
        var f = (def ? def.fields : []).find(function (x) { return x.k === key; });
        var proto = {};
        if (f && f.of) {
          f.of.forEach(function (s) {
            proto[s.k] = s.type === 'list' || s.type === 'links' ? [] : (s.type === 'bool' ? false : '');
          });
        } else {
          proto = { label: 'Пункт', href: '#' };
        }
        var arr = getPath(b, key);
        if (!Array.isArray(arr)) {
          arr = [];
          setPath(b, key, arr);
        }
        arr.push(proto);
        commit();
        return;
      }

      var del = e.target.closest('[data-listdel]');
      if (del && b) {
        var arr2 = getPath(b, del.dataset.listdel);
        if (Array.isArray(arr2)) {
          mark(true);
          arr2.splice(Number(del.dataset.i), 1);
          commit();
        }
        return;
      }

      var dup = e.target.closest('[data-listdup]');
      if (dup && b) {
        var arr3 = getPath(b, dup.dataset.listdup);
        var i = Number(dup.dataset.i);
        if (Array.isArray(arr3) && arr3[i]) {
          mark(true);
          arr3.splice(i + 1, 0, JSON.parse(JSON.stringify(arr3[i])));
          commit();
        }
        return;
      }

      var up = e.target.closest('[data-listup]');
      if (up && b) {
        var arr4 = getPath(b, up.dataset.listup);
        var i2 = Number(up.dataset.i);
        if (Array.isArray(arr4) && i2 > 0) {
          mark(true);
          var tmp = arr4[i2 - 1];
          arr4[i2 - 1] = arr4[i2];
          arr4[i2] = tmp;
          commit();
        }
        return;
      }

      var clr = e.target.closest('[data-clear]');
      if (clr && b) {
        mark(true);
        setPath(b, clr.dataset.clear, '');
        commit();
        return;
      }

      var upl = e.target.closest('[data-upload]');
      if (upl && b) {
        var targetPath = upl.dataset.upload;
        pickFile(function (dataUrl) {
          if (!dataUrl) return;
          mark(true);
          setPath(b, targetPath, dataUrl);
          commit();
          toast('Картинка вшита в страницу', 'ok');
        });
      }
    });
  }

  function pickFile(cb) {
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.onchange = function () {
      var f = inp.files && inp.files[0];
      if (!f) return;
      if (f.size > 12 * 1024 * 1024) {
        toast('Файл больше 12 МБ — возьмите картинку поменьше', 'bad');
        return;
      }
      compressImage(f).then(cb);
    };
    inp.click();
  }

  function compressImage(file) {
    return new Promise(function (res) {
      var fr = new FileReader();
      fr.onerror = function () { res(''); };
      fr.onload = function () {
        var img = new Image();
        img.onerror = function () { res(fr.result); };
        img.onload = function () {
          var w = img.naturalWidth || img.width;
          var h = img.naturalHeight || img.height;
          var scale = Math.min(1, 1600 / w);
          try {
            var c = document.createElement('canvas');
            c.width = Math.max(1, Math.round(w * scale));
            c.height = Math.max(1, Math.round(h * scale));
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            var out = c.toDataURL('image/jpeg', 0.82);
            if (out.length > 1400000) toast('Картинка сжата примерно до ' + Math.round(out.length / 1024) + ' КБ', 'ok');
            res(out);
          } catch (err) {
            res(fr.result);
          }
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  /* ---------- верхняя панель ---------- */

  function setupTopbar() {
    $('#projTitle').addEventListener('input', function () {
      project().title = this.value;
      saveStore();
      var opt = $('#projList').querySelector('option[value="' + S.currentId + '"]');
      if (opt) opt.textContent = this.value;
    });
    $('#projTitle').addEventListener('change', function () { mark(true); commit({ full: false }); });

    $('#projList').addEventListener('change', function () {
      S.currentId = this.value;
      S.sel = null;
      S.undo.length = 0;
      S.redo.length = 0;
      saveStore();
      renderTopbar();
      render();
      updateHistoryButtons();
    });

    $('#btnNew').addEventListener('click', function () {
      var name = prompt('Название нового сайта:', 'Мой сайт');
      if (name === null) return;
      var p = fromTemplate('landing');
      p.title = name || 'Мой сайт';
      p.blocks = [];
      S.projects[p.id] = p;
      S.order.unshift(p.id);
      S.currentId = p.id;
      S.sel = null;
      S.undo.length = 0;
      saveStore();
      renderTopbar();
      render();
      updateHistoryButtons();
    });

    $('#btnDup').addEventListener('click', function () {
      var p = project();
      var c = JSON.parse(JSON.stringify(p));
      c.id = uid();
      c.title = p.title + ' (копия)';
      c.blocks.forEach(function (b) { b.id = uid(); });
      S.projects[c.id] = c;
      S.order.unshift(c.id);
      S.currentId = c.id;
      S.sel = null;
      saveStore();
      renderTopbar();
      render();
      toast('Создана копия проекта', 'ok');
    });

    $('#btnDel').addEventListener('click', function () {
      if (S.order.length < 2) {
        toast('Это единственный проект — удалять нечего', 'bad');
        return;
      }
      if (!confirm('Удалить проект «' + project().title + '»?')) return;
      var id = S.currentId;
      delete S.projects[id];
      S.order = S.order.filter(function (x) { return x !== id; });
      S.currentId = S.order[0];
      S.sel = null;
      saveStore();
      renderTopbar();
      render();
      toast('Проект удалён', 'ok');
    });

    $('#btnUndo').addEventListener('click', undo);
    $('#btnRedo').addEventListener('click', redo);

    $('#leftTabs').addEventListener('click', function (e) {
      var b = e.target.closest('[data-tab]');
      if (!b) return;
      S.tab = b.dataset.tab;
      var kids = this.children;
      for (var i = 0; i < kids.length; i++) kids[i].classList.toggle('on', kids[i] === b);
      $('#railBody').innerHTML = S.tab === 'blocks' ? renderPalette() : S.tab === 'layers' ? renderLayers() : renderThemeTab();
    });

    $('#deviceSeg').addEventListener('click', function (e) {
      var b = e.target.closest('[data-device]');
      if (!b) return;
      S.device = b.dataset.device;
      var kids = this.children;
      for (var i = 0; i < kids.length; i++) kids[i].classList.toggle('on', kids[i] === b);
      renderCanvas();
    });

    $('#siteSel').addEventListener('click', function () {
      S.sel = null;
      renderCanvas();
      renderInspector();
    });

    $('#btnPreview').addEventListener('click', openPreview);
    $('#btnTemplate').addEventListener('click', openTemplates);
    $('#btnExport').addEventListener('click', openExport);
    $('#btnHtml').addEventListener('click', function () {
      SB.download(new Blob([SB.buildPage(project())], { type: 'text/html' }), 'index.html');
      toast('Файл index.html скачан', 'ok');
    });
    $('#btnProject').addEventListener('click', openProject);
  }

  function openPreview() {
    var blob = new Blob([SB.buildPage(project())], { type: 'text/html' });
    var url = URL.createObjectURL(blob);
    if (!window.open(url, '_blank')) toast('Браузер заблокировал новое окно', 'bad');
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }

  /* ---------- модальные окна ---------- */

  var modalHandler = null;

  function closeModal() {
    var root = $('#modalRoot');
    root.hidden = true;
    root.innerHTML = '';
    modalHandler = null;
  }

  /* Подписка одна на modalRoot: повторные открытия не плодят обработчики. */
  function showModal(html, onClick) {
    var root = $('#modalRoot');
    root.hidden = false;
    root.innerHTML = '<div class="sb-modal-back"></div>' +
      '<div class="sb-modal"><div class="sb-modal-in" role="dialog" aria-modal="true">' + html + '</div></div>';
    modalHandler = onClick || null;
    var first = root.querySelector('input,button,select');
    if (first) setTimeout(function () { first.focus(); }, 30);
  }

  function setupModalEvents() {
    $('#modalRoot').addEventListener('click', function (e) {
      if (e.target.closest('[data-close]') ||
          e.target.classList.contains('sb-modal') ||
          e.target.classList.contains('sb-modal-back')) {
        closeModal();
        return;
      }
      if (modalHandler) modalHandler(e, e.currentTarget);
    });
  }

  function openTemplates() {
    var pal = Object.keys(SB.ACCENTS);
    var html = '<div class="sb-modal-h"><h3>Шаблоны</h3><button type="button" class="sb-x" data-close="1">✕</button></div>' +
      '<p class="sb-modal-note">Шаблон заменит блоки текущего сайта «' + esc(project().title) +
      '». Настройки темы и заголовок останутся как есть.</p>' +
      '<div class="sb-tpl">' + TEMPLATES.map(function (t, i) {
        var c = SB.ACCENTS[pal[i % pal.length]];
        return '<button type="button" class="sb-tpl-card" data-tpl="' + t.id + '">' +
          '<span class="sb-tpl-preview" style="--a:' + c[0] + ';--b:' + c[1] + '"><i></i><i></i><i></i><i></i></span>' +
          '<b>' + esc(t.name) + '</b><span>' + esc(t.desc) + '</span>' +
          '<em>' + t.blocks.length + ' блоков</em></button>';
      }).join('') + '</div>';

    showModal(html, function (e) {
      var c = e.target.closest('[data-tpl]');
      if (!c) return;
      mark(true);
      var fresh = fromTemplate(c.dataset.tpl);
      project().blocks = fresh.blocks;
      S.sel = null;
      commit();
      closeModal();
      var t = TEMPLATES.find(function (x) { return x.id === c.dataset.tpl; });
      toast('Применён шаблон «' + (t ? t.name : '') + '»', 'ok');
    });
  }

  /* ---------- экспорт ---------- */

  function slugify(s) {
    var map = {
      а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
      к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
      х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya'
    };
    return String(s || '').toLowerCase().split('').map(function (ch) {
      return map[ch] !== undefined ? map[ch] : ch;
    }).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  }

  function exportFiles() {
    var p = project();
    return [
      { name: 'index.html', content: SB.buildPage(p) },
      { name: '404.html', content: SB.NOT_FOUND_HTML },
      { name: 'site.json', content: JSON.stringify(p, null, 2) },
      { name: '.nojekyll', content: '' },
      { name: '.github/workflows/pages.yml', content: SB.PAGES_WORKFLOW },
      { name: 'README.md', content: readme(p) }
    ];
  }

  function readme(p) {
    return [
      '# ' + p.title,
      '',
      p.description || '',
      '',
      'Сайт собран в конструкторе САЙТСТРОЙ: статические файлы в одном репозитории,',
      'раздаёт их бесплатный GitHub Pages.',
      '',
      '## Как опубликовать',
      '',
      '1. Создайте публичный репозиторий на GitHub (github.com/new): имя латиницей без пробелов.',
      '2. Загрузите файлы из архива через **Add file → Upload files**.',
      '   Важно: загрузите и папку `.github` — без неё автопубликация не запустится.',
      '3. Откройте **Settings → Pages**, в *Build and deployment* выберите **Source: GitHub Actions** и сохраните.',
      '4. Через минуту-два сайт откроется по адресу',
      '   `https://<ваш-ник>.github.io/<имя-репозитория>/`.',
      '',
      'Если нужен только сам сайт, а не исходник — скачайте один `index.html`:',
      'он открывается двойным щелчком, без сервера и без интернета.',
      '',
      'После этого любая правка `index.html` в GitHub пересобирает сайт автоматически.',
      '',
      '## Что внутри',
      '',
      '| Файл | Зачем |',
      '| --- | --- |',
      '| `index.html` | сам сайт: стили и скрипты встроены, внешних зависимостей нет |',
      '| `404.html` | страница ошибки |',
      '| `site.json` | исходник проекта — вернёте его в конструктор в любой момент |',
      '| `.github/workflows/pages.yml` | автопубликация через GitHub Actions |',
      '',
      '## Как вернуться в конструктор',
      '',
      '1. Откройте `site.json` и скопируйте содержимое.',
      '2. В конструкторе нажмите ⇅, вставьте JSON и нажмите «Загрузить из текста».',
      '',
      '---',
      '',
      'Хостинг не нужен: файлы лежат в репозитории, сайт раздаёт GitHub Pages.'
    ].join('\n');
  }

  function openExport() {
    var slug = slugify(project().title) || 'site';
    var html = [
      '<div class="sb-modal-h"><h3>Скачать сайт</h3><button type="button" class="sb-x" data-close="1">✕</button></div>',
      '<div class="sb-btn-row">',
      '  <button type="button" class="sb-btn-primary" data-act="html">⤓ Скачать index.html</button>',
      '  <button type="button" class="sb-btn-ghost" data-act="zip">⤓ Скачать ' + esc(slug) + '.zip</button>',
      '  <button type="button" class="sb-btn-ghost" data-act="view">Открыть в окне</button>',
      '</div>',
      '<p class="sb-modal-note"><code>index.html</code> — готовый сайт целиком: стили и скрипты внутри,',
      '  ни одного внешнего запроса. Открывается двойным щелчком, без сервера и без интернета.</p>',
      '<div class="sb-insp-group"><h5>Как получить ссылку на сайт</h5>',
      '  <ol class="sb-steps">',
      '    <li>Скачайте <code>index.html</code> (для страницы) или ZIP (если хотите вернуть проект в конструктор).',
      '    <li>Откройте <a href="https://github.com/new" target="_blank" rel="noopener">github.com/new</a>',
      '      и создайте <b>публичный</b> репозиторий: имя латиницей без пробелов, галочку «Add a README» ставить не нужно.</li>',
      '    <li>На странице репозитория: <b>Add file → Upload files</b> → перетащите скачанные файлы → <b>Commit changes</b>.',
      '      В ZIP есть папка <code>.github</code> — её тоже нужно загрузить, без неё автопубликация не запустится.</li>',
      '    <li>Откройте <b>Settings → Pages</b>, в <i>Build and deployment</i> выберите <b>Source: GitHub Actions</b> и сохраните.</li>',
      '    <li>Через мину-два Actions закончит работу, и сайт откроется по адресу',
      '      <code>https://&lt;ваш-ник&gt;.github.io/&lt;имя-репозитория&gt;/</code>.</li>',
      '    <li>Дальше любая правка <code>index.html</code> в репозитории обновляет сайт автоматически.</li>',
      '  </ol>',
      '  <div class="sb-btn-row">',
      '    <a class="sb-btn-ghost" href="https://github.com/new" target="_blank" rel="noopener">Создать репозиторий</a>',
      '    <a class="sb-btn-ghost" href="https://docs.github.com/pages" target="_blank" rel="noopener">Что такое GitHub Pages</a>',
      '  </div>',
      '</div>',
      '<details class="sb-details"><summary>Опубликовать отсюда, через GitHub — без ручной загрузки</summary>',
      '  <p class="sb-modal-note">Кнопка сама создаст репозиторий и запустит публикацию. Нужен токен.',
      '  Он живёт только в памяти этой вкладки: в localStorage и никуда больше он не попадает.</p>',
      '  <ol class="sb-steps">',
      '    <li>GitHub → <b>Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate</b>.</li>',
      '    <li>Выберите свой аккаунт, срок жизни — например, 30 дней.</li>',
      '    <li>В разделе <b>Repository permissions</b> включите <b>Contents: Read and write</b>. Этого достаточно.</li>',
      '    <li>Скопируйте токен и вставьте ниже.</li>',
      '  </ol>',
      '  <div class="sb-form2">',
      '    <label>Токен<input type="password" id="ghToken" placeholder="github_pat_…" autocomplete="off" spellcheck="false"></label>',
      '    <label>Имя репозитория<input type="text" id="ghRepo" value="' + esc(slug) + '" spellcheck="false"></label>',
      '  </div>',
      '  <button type="button" class="sb-btn-primary" data-act="publish">Создать репозиторий и опубликовать</button>',
      '  <div class="sb-log" id="ghLog"></div>',
      '</details>',
      '<p class="sb-modal-note">Адрес сайта: <span id="pubLink">появится после публикации</span></p>'
    ].join('');

    showModal(html, function (e, root) {
      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      var act = btn.dataset.act;

      if (act === 'zip') {
        var files = exportFiles();
        var blob = SB.zip(files.map(function (f) { return { name: f.name, data: f.content }; }));
        SB.download(blob, slug + '.zip');
        toast('ZIP готов. Распакуйте и залейте в репозиторий.', 'ok');
        return;
      }
      if (act === 'html') {
        SB.download(new Blob([SB.buildPage(project())], { type: 'text/html' }), 'index.html');
        return;
      }
      if (act === 'view') {
        openPreview();
        return;
      }

      if (act === 'publish') {
        var token = $('#ghToken', root).value.trim();
        var repo = $('#ghRepo', root).value.trim();
        var log = $('#ghLog', root);
        log.classList.add('has');
        if (!token) {
          logLine(log, 'Сначала вставьте токен.', 'bad');
          return;
        }
        if (!/^[A-Za-z0-9._-]{2,60}$/.test(repo)) {
          logLine(log, 'Имя репозитория: латиница, цифры, дефис, точка, подчёркивание.', 'bad');
          return;
        }
        btn.disabled = true;
        var label = btn.textContent;
        btn.textContent = 'Публикую…';
        log.innerHTML = '';
        var gh = new SB.Gh(token);
        gh.publish({
          repo: repo,
          description: project().description || ('Сайт из САЙТСТРОЙ: ' + project().title),
          files: exportFiles().map(function (f) { return { name: f.name, content: f.content }; }),
          onStep: function (msg) { logLine(log, msg); }
        }).then(function (r) {
          btn.disabled = false;
          btn.textContent = label;
          logLine(log, r.built ? 'Сайт собран и опубликован.' : 'Репозиторий создан, сборка идёт — 1–2 минуты.', 'ok');
          logLine(log, 'Ссылка: ' + r.url, 'ok');
          var slot = $('#pubLink', root);
          slot.innerHTML = '';
          var a = document.createElement('a');
          a.href = r.url;
          a.target = '_blank';
          a.rel = 'noopener';
          a.textContent = r.url;
          slot.appendChild(a);
          toast('Сайт опубликован', 'ok');
        }, function (err) {
          btn.disabled = false;
          btn.textContent = label;
          logLine(log, 'Ошибка: ' + err.message + (err.hint ? ' — ' + err.hint : ''), 'bad');
        });
      }
    });
  }

  function logLine(log, msg, kind) {
    var d = document.createElement('div');
    d.className = 'sb-log-line ' + (kind || '');
    d.textContent = msg;
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
  }

  /* ---------- файл проекта ---------- */

  function openProject() {
    var p = project();
    var json = JSON.stringify(p, null, 2);
    var html = '<div class="sb-modal-h"><h3>Файл проекта</h3><button type="button" class="sb-x" data-close="1">✕</button></div>' +
      '<p class="sb-modal-note">site.json хранит все блоки, тексты и настройки темы. Можно держать его рядом' +
      ' с сайтом в Git и переносить на другое устройство.</p>' +
      '<div class="sb-btn-row">' +
      '<button type="button" class="sb-btn-ghost" data-act="down-json">Скачать site.json</button>' +
      '<button type="button" class="sb-btn-ghost" data-act="up-json">Выбрать файл…</button></div>' +
      '<label class="sb-field sb-mt"><span class="sb-fl">Или вставьте JSON в поле ниже</span>' +
      '<textarea id="ioArea" rows="8" spellcheck="false"></textarea></label>' +
      '<button type="button" class="sb-btn-primary sb-mt" data-act="apply-json">Загрузить из текста</button>';

    showModal(html, function (e, root) {
      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      var act = btn.dataset.act;

      if (act === 'down-json') {
        SB.download(new Blob([json], { type: 'application/json' }), (slugify(p.title) || 'site') + '.json');
        return;
      }
      if (act === 'up-json') {
        var inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = 'application/json,.json';
        inp.onchange = function () {
          var fr = new FileReader();
          fr.onload = function () { $('#ioArea', root).value = fr.result; };
          fr.readAsText(inp.files[0]);
        };
        inp.click();
        return;
      }
      if (act === 'apply-json') {
        try {
          var data = JSON.parse($('#ioArea', root).value);
          if (!data || !Array.isArray(data.blocks)) throw new Error('в JSON нет поля blocks');
          mark(true);
          var tgt = project();
          tgt.title = data.title || 'Импортированный сайт';
          tgt.description = data.description || '';
          tgt.theme = Object.assign(SB.newTheme(), data.theme || {});
          tgt.blocks = data.blocks.map(function (b) { b.id = uid(); return b; });
          S.sel = null;
          commit();
          closeModal();
          toast('Проект загружен', 'ok');
        } catch (err) {
          toast('Не получилось прочитать JSON: ' + err.message, 'bad');
        }
      }
    });
  }

  /* ---------- клавиатура ---------- */

  function setupKeys() {
    document.addEventListener('keydown', function (e) {
      var ae = document.activeElement;
      var typing = ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName);
      var mod = e.ctrlKey || e.metaKey;
      var k = e.key.toLowerCase();

      if (mod && k === 's') {
        e.preventDefault();
        var saved = saveStoreNow();
        toast(saved ? 'Проект сохранён в браузере' : 'Не сохранилось: хранилище переполнено', saved ? 'ok' : 'bad');
        return;
      }
      if (mod && k === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && k === 'e') {
        e.preventDefault();
        openExport();
        return;
      }
      if (mod && k === 'd' && S.sel) {
        e.preventDefault();
        duplicateBlock(S.sel);
        return;
      }
      if (e.key === 'Escape') {
        if (!$('#modalRoot').hidden) closeModal();
        else if (S.sel) {
          S.sel = null;
          renderCanvas();
          renderInspector();
        }
        return;
      }
      if (typing) return;

      if ((e.key === 'Delete' || e.key === 'Backspace') && S.sel) {
        e.preventDefault();
        removeBlock(S.sel);
        return;
      }
      if (S.sel && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        moveBlockBy(S.sel, e.key === 'ArrowUp' ? -1 : 1);
      }
    });
  }

  /* ---------- старт ---------- */

  function init() {
    /* стили конструктора живут только внутри .sbui, стили сайта — только
       внутри .sb-canvas: друг на друга они не влияют */
    var uiSt = document.createElement('style');
    uiSt.textContent = SB.scopeCSS($('#ui-css').textContent, '.sbui');
    document.head.appendChild(uiSt);

    var editSt = document.createElement('style');
    editSt.textContent = $('#edit-css').textContent;
    document.head.appendChild(editSt);

    deviceBox = $('#device');
    deviceFit = $('#deviceFit');
    stageScroll = $('#stageScroll');
    canvasPage = $('#canvasPage');
    styleTag = $('#canvasStyle');

    loadStore();
    ensureProject();
    S.sel = null;

    setupTopbar();
    setupModalEvents();
    setupCanvasEvents();
    setupRailEvents();
    setupInspectorEvents();
    setupKeys();

    renderTopbar();
    render();
    updateHistoryButtons();

    window.addEventListener('resize', function () {
      clearTimeout(canvasTimer);
      canvasTimer = setTimeout(function () {
        canvasTimer = null;
        fitCanvas();
      }, 120);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();