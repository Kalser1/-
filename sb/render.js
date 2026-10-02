/* САЙТСТРОЙ — ядро: реестр блоков, генерация CSS темы и HTML страницы.
   Один и тот же рендер используется и для live-превью, и для экспорта,
   поэтому предпросмотр всегда совпадает с результатом. */
(function () {
  'use strict';
  var SB = (window.SB = window.SB || {});

  /* ---------- утилиты ---------- */

  var ENT = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ENT[c]; });
  }
  SB.esc = esc;

  /* пропускает только безопасные схемы, иначе заглушка */
  function safeUrl(u) {
    var s = String(u == null ? '' : u).trim();
    if (!s) return '';
    if (/^(https?:|mailto:|tel:)/i.test(s)) return s;
    if (/^[#/.]/.test(s)) return s;
    return '';
  }

  /* мини-разметка: **жирный**, *курсив*, `код`, [текст](ссылка) */
  function md(src) {
    var s = esc(src == null ? '' : src);
    s = s.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, function (m, t, h) {
      var u = safeUrl(h.replace(/&amp;/g, '&'));
      return u ? '<a href="' + esc(u) + '">' + t + '</a>' : t;
    });
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    return s;
  }

  function paras(src) {
    return String(src == null ? '' : src)
      .split(/\n{2,}/)
      .filter(function (p) { return p.trim(); })
      .map(function (p) { return '<p>' + md(p).replace(/\n/g, '<br>') + '</p>'; })
      .join('');
  }

  function isDark(c) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(c).trim());
    if (!m) return true;
    var l = (parseInt(m[1], 16) * 299 + parseInt(m[2], 16) * 587 + parseInt(m[3], 16) * 114) / 1000;
    return l < 140;
  }

  function pick(list, value, fallback) {
    return list.indexOf(value) >= 0 ? value : fallback;
  }

  /* ---------- утилиты для редактора ----------

     Превращает CSS в scoped-версию, чтобы стили сайта не задели интерфейс
     конструктора, а UI не протекал в превью. Понимает только тот CSS,
     который генерирует themeCSS: правила, @media, @container. */

  SB.scopeCSS = function (css, prefix) {
    var out = [];
    var i = 0;
    var src = String(css).replace(/\/\*[\s\S]*?\*\//g, '');
    var len = src.length;
    var buf = '';

    function map(sel) {
      return sel.split(',').map(function (one) {
        one = one.trim();
        if (!one) return one;
        if (one === ':root' || one === 'html') return prefix;
        if (/^html\b/.test(one)) return prefix;
        if (one === 'body') return prefix + ' .sb-page';
        if (/^body\b/.test(one)) return prefix + ' .sb-page' + one.slice(4);
        return prefix + ' ' + one;
      }).join(',');
    }

    while (i < len) {
      var ch = src[i];
      if (ch === '{') {
        var sel = buf.trim();
        buf = '';
        var depth = 1;
        var j = i + 1;
        var start = j;
        while (j < len && depth) {
          if (src[j] === '{') depth++;
          else if (src[j] === '}') depth--;
          j++;
        }
        var body = src.slice(start, j - 1);
        i = j;
        if (sel.charAt(0) !== '@') out.push(map(sel) + '{' + body + '}');
        else if (/^@(media|container|supports)\b/i.test(sel)) out.push(sel + '{' + SB.scopeCSS(body, prefix) + '}');
        else out.push(sel + '{' + body + '}');
      } else if (ch === '}') {
        i++;
      } else {
        buf += ch;
        i++;
      }
    }
    return out.join('\n');
  };

  /* ---------- палитры и шрифты ---------- */

  SB.ACCENTS = {
    indigo: ['#6366f1', '#a855f7'],
    violet: ['#8b5cf6', '#ec4899'],
    emerald: ['#10b981', '#22d3ee'],
    cyan: ['#06b6d4', '#3b82f6'],
    amber: ['#f59e0b', '#ef4444'],
    rose: ['#f43f5e', '#f97316'],
    lime: ['#84cc16', '#22c55e'],
    steel: ['#64748b', '#94a3b8']
  };

  SB.FONTS = {
    sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', 'Noto Serif', serif",
    mono: "'JetBrains Mono', 'Cascadia Mono', Consolas, 'SF Mono', monospace",
    rounded: "'Trebuchet MS', 'Segoe UI', system-ui, sans-serif"
  };

  var LIGHT = { bg: '#ffffff', bgSoft: '#f4f6fb', surface: '#ffffff', text: '#101319', muted: '#5b6478', border: 'rgba(10,15,30,.12)' };
  var DARK = { bg: '#0a0b10', bgSoft: '#0f1118', surface: '#141722', text: '#eef1f7', muted: '#98a1b3', border: 'rgba(255,255,255,.10)' };

  SB.newTheme = function (over) {
    var t = {
      dark: true,
      accent: '#6366f1',
      accent2: '#a855f7',
      font: 'sans',
      radius: 16,
      container: 1140,
      gap: 72,
      nav: 'solid',
      shadows: true,
      reveal: true
    };
    return Object.assign(t, over || {});
  };

  function themeColors(t) {
    var base = t.dark ? DARK : LIGHT;
    return {
      bg: t.bg || base.bg,
      bgSoft: t.bgSoft || base.bgSoft,
      surface: t.surface || base.surface,
      text: t.text || base.text,
      muted: t.muted || base.muted,
      border: t.border || base.border
    };
  }

  /* ---------- реестр блоков ----------
     fields описывают панель свойств: type + подпись. Типы:
     text, textarea, url, image, number, select, color, bool, align,
     list (массив объектов с вложенными fields), links (label+href) */

  var ALIGNS = ['left', 'center', 'right'];
  var al = function (def) { return { type: 'align', def: def || 'left' }; };

  SB.BLOCKS = [
    {
      type: 'navbar', name: 'Меню', icon: '≡', group: 'Шапка',
      desc: 'Логотип и навигация с кнопкой',
      fields: [
        { k: 'brand', label: 'Название', type: 'text' },
        { k: 'logo', label: 'Логотип (картинка)', type: 'image' },
        { k: 'links', label: 'Пункты меню', type: 'links' },
        { k: 'cta', label: 'Текст кнопки', type: 'text' },
        { k: 'ctaHref', label: 'Ссылка кнопки', type: 'url' },
        { k: 'sticky', label: 'Липкое при скролле', type: 'bool' },
        { k: 'toggle', label: 'Показывать кнопку (в мобильной версии)', type: 'bool' }
      ],
      defaults: {
        brand: 'САЙТСТРОЙ', links: [
          { label: 'О нас', href: '#about' },
          { label: 'Услуги', href: '#features' },
          { label: 'Контакты', href: '#contacts' }
        ], cta: 'Написать', ctaHref: '#contacts', sticky: true, toggle: true
      },
      render: function (b, t) {
        var links = (b.links || []).map(function (l) {
          return '<li><a href="' + esc(safeUrl(l.href) || '#') + '">' + esc(l.label) + '</a></li>';
        }).join('');
        var logo = b.logo
          ? '<img class="sb-brand-img" src="' + esc(b.logo) + '" alt="">'
          : '<span class="sb-brand-mark">' + esc((b.brand || '?').slice(0, 1).toUpperCase()) + '</span>';
        var cta = b.cta
          ? '<a class="sb-btn sb-btn-solid sb-nav-cta" href="' + esc(safeUrl(b.ctaHref) || '#') + '">' + esc(b.cta) + '</a>'
          : '';
        var burger = b.toggle === false ? '' :
          '<button class="sb-burger-host" type="button" aria-label="Меню" aria-expanded="false">' +
          '<span class="sb-burger"><i></i><i></i><i></i></span></button>';
        return '<header class="sb-nav' + (b.sticky ? ' sb-nav-sticky' : '') + ' sb-nav-' + pick(['solid', 'blur', 'plain'], b.sticky === false ? 'plain' : 'blur', 'blur') + '">' +
          '<div class="sb-container sb-nav-in">' +
            '<a class="sb-brand" href="#top">' + logo + '<span>' + esc(b.brand) + '</span></a>' +
            burger +
            '<nav class="sb-nav-links"><ul>' + links + '</ul>' + cta + '</nav>' +
          '</div></header>';
      }
    },

    {
      type: 'hero', name: 'Первый экран', icon: '★', group: 'Шапка',
      desc: 'Крупный заголовок, описание и кнопки',
      fields: [
        { k: 'eyebrow', label: 'Надзаголовок', type: 'text' },
        { k: 'title', label: 'Заголовок', type: 'text' },
        { k: 'subtitle', label: 'Описание', type: 'textarea' },
        { k: 'image', label: 'Фоновая картинка', type: 'image' },
        { k: 'b1', label: 'Кнопка 1 — текст', type: 'text' },
        { k: 'b1h', label: 'Кнопка 1 — ссылка', type: 'url' },
        { k: 'b2', label: 'Кнопка 2 — текст', type: 'text' },
        { k: 'b2h', label: 'Кнопка 2 — ссылка', type: 'url' },
        { k: 'align', label: 'Выравнивание', type: 'align' },
        { k: 'height', label: 'Высота', type: 'select', options: ['compact', 'normal', 'tall', 'full'], labels: ['Компактная', 'Обычная', 'Высокая', 'На весь экран'] },
        { k: 'overlay', label: 'Затемнение фона', type: 'number', min: 0, max: 90, step: 5 }
      ],
      defaults: {
        eyebrow: 'Представьте', title: 'Сайт, который собирается мышью',
        subtitle: 'Никакого кода и хостинга: соберите страницу из блоков, выберите цвета — и опубликуйте прямо в GitHub Pages.',
        b1: 'Смотреть услуги', b1h: '#features', b2: 'Контакты', b2h: '#contacts',
        align: 'center', height: 'normal', overlay: 55
      },
      render: function (b) {
        var btns = '';
        if (b.b1) btns += '<a class="sb-btn sb-btn-solid sb-btn-lg" href="' + esc(safeUrl(b.b1h) || '#') + '">' + esc(b.b1) + '</a>';
        if (b.b2) btns += '<a class="sb-btn sb-btn-ghost sb-btn-lg" href="' + esc(safeUrl(b.b2h) || '#') + '">' + esc(b.b2) + '</a>';
        var bg = b.image ? ' style="background-image:url(' + JSON.stringify(b.image) + ')"' : '';
        return '<section class="sb-hero sb-hero-' + pick(['compact', 'normal', 'tall', 'full'], b.height, 'normal') +
          ' sb-align-' + pick(ALIGNS, b.align, 'center') + (b.image ? ' sb-has-img' : '') + '"' + bg + '>' +
          '<div class="sb-hero-veil" style="opacity:' + (Number(b.overlay) || 0) / 100 + '"></div>' +
          '<div class="sb-container sb-hero-in">' +
            (b.eyebrow ? '<span class="sb-eyebrow">' + esc(b.eyebrow) + '</span>' : '') +
            '<h1 class="sb-hero-title">' + esc(b.title) + '</h1>' +
            (b.subtitle ? '<p class="sb-hero-sub">' + md(b.subtitle) + '</p>' : '') +
            (btns ? '<div class="sb-hero-btns">' + btns + '</div>' : '') +
          '</div></section>';
      }
    },

    {
      type: 'heading', name: 'Заголовок', icon: 'H', group: 'Текст',
      desc: 'Подзаголовок раздела',
      fields: [
        { k: 'text', label: 'Текст', type: 'text' },
        { k: 'sub', label: 'Пояснение', type: 'textarea' },
        { k: 'align', label: 'Выравнивание', type: 'align' },
        { k: 'anchor', label: 'Якорь для меню', type: 'text' }
      ],
      defaults: { text: 'Заголовок раздела', sub: '', align: 'left', anchor: '' },
      render: function (b) {
        return '<section class="sb-section sb-align-' + pick(ALIGNS, b.align, 'left') + '"' +
          (b.anchor ? ' id="' + esc(b.anchor) + '"' : '') + '><div class="sb-container">' +
          '<h2 class="sb-h2">' + esc(b.text) + '</h2>' +
          (b.sub ? '<p class="sb-lead">' + md(b.sub) + '</p>' : '') + '</div></section>';
      }
    },

    {
      type: 'text', name: 'Текст', icon: '¶', group: 'Текст',
      desc: 'Абзацы: **жирный**, *курсив*, [ссылка](url)',
      fields: [
        { k: 'text', label: 'Содержимое', type: 'textarea', rows: 8 },
        { k: 'width', label: 'Ширина колонки', type: 'select', options: ['narrow', 'normal', 'wide'], labels: ['Узко', 'Обычно', 'Во всю ширину'] },
        { k: 'anchor', label: 'Якорь для меню', type: 'text' }
      ],
      defaults: {
        text: 'Здесь обычный текст.\n\nПустая строка делает новый абзац. Поддерживается разметка: **жирный**, *курсив*, `код` и [ссылка](https://github.com).',
        width: 'normal', anchor: 'about'
      },
      render: function (b) {
        return '<section class="sb-section" id="' + esc(b.anchor || '') + '"><div class="sb-container">' +
          '<div class="sb-prose sb-prose-' + pick(['narrow', 'normal', 'wide'], b.width, 'normal') + '">' +
          paras(b.text) + '</div></div></section>';
      }
    },

    {
      type: 'image', name: 'Картинка', icon: '▣', group: 'Контент',
      desc: 'Ссылка на изображение или файл с устройства',
      fields: [
        { k: 'src', label: 'Изображение', type: 'image' },
        { k: 'alt', label: 'Подпись (alt)', type: 'text' },
        { k: 'caption', label: 'Подпись снизу', type: 'text' },
        { k: 'fit', label: 'Обрезка', type: 'select', options: ['cover', 'contain'], labels: ['Заполнить по ширине', 'Целиком'] },
        { k: 'ratio', label: 'Пропорции', type: 'select', options: ['auto', '16x9', '4x3', '1x1'], labels: ['Как есть', '16:9', '4:3', '1:1'] },
        { k: 'radius', label: 'Скругление', type: 'select', options: ['theme', 'soft', 'round', 'none'], labels: ['Как в теме', 'Мягкое', 'Круглое', 'Без скругления'] }
      ],
      defaults: { src: '', alt: '', caption: '', fit: 'cover', ratio: '16x9', radius: 'theme' },
      render: function (b) {
        if (!b.src) return '<section class="sb-section"><div class="sb-container">' +
          '<div class="sb-img sb-img-empty sb-img-ratio-16x9">Добавьте картинку в настройках блока</div></div></section>';
        var r = pick(['auto', '16x9', '4x3', '1x1'], b.ratio, '16x9');
        return '<figure class="sb-figure"><div class="sb-img sb-img-' + pick(['cover', 'contain'], b.fit, 'cover') +
          ' sb-img-ratio-' + r + ' sb-img-r-' + pick(['theme', 'soft', 'round', 'none'], b.radius, 'theme') + '">' +
          '<img src="' + esc(b.src) + '" alt="' + esc(b.alt) + '" loading="lazy"></div>' +
          (b.caption ? '<figcaption>' + esc(b.caption) + '</figcaption>' : '') + '</figure>';
      }
    },

    {
      type: 'cards', name: 'Карточки', icon: '▦', group: 'Контент',
      desc: 'Плитка карточек с заголовком и текстом',
      fields: [
        { k: 'title', label: 'Заголовок секции', type: 'text' },
        { k: 'sub', label: 'Пояснение', type: 'textarea' },
        { k: 'cols', label: 'Колонок', type: 'select', options: ['1', '2', '3', '4'], labels: ['1', '2', '3', '4'] },
        { k: 'items', label: 'Карточки', type: 'list', itemLabel: 'Карточка', of: [
          { k: 'icon', label: 'Иконка (эмодзи)', type: 'text' },
          { k: 'title', label: 'Заголовок', type: 'text' },
          { k: 'text', label: 'Текст', type: 'textarea' },
          { k: 'href', label: 'Ссылка', type: 'url' }
        ]},
        { k: 'anchor', label: 'Якорь для меню', type: 'text' }
      ],
      defaults: {
        title: 'Что мы делаем', sub: 'Три причины выбрать нас', cols: '3', anchor: 'features',
        items: [
          { icon: '⚡', title: 'Быстро', text: 'Сайт готов за один вечер: блоки, цвета, текст.' },
          { icon: '🛡', title: 'Надёжно', text: 'Статические файлы, которые нечему ломаться.' },
          { icon: '💸', title: 'Бесплатно', text: 'Хостинг от GitHub — 0 ₽ за визиты.' }
        ]
      },
      render: function (b) {
        var cards = (b.items || []).map(function (it, i) {
          var inner = (it.icon ? '<span class="sb-card-icon">' + esc(it.icon) + '</span>' : '') +
            '<h3>' + esc(it.title) + '</h3><p>' + md(it.text) + '</p>';
          var body = it.href ? '<a class="sb-card" href="' + esc(safeUrl(it.href)) + '">' + inner + '</a>'
            : '<div class="sb-card">' + inner + '</div>';
          return '<li class="sb-reveal" style="--d:' + (i % 4) * 60 + 'ms">' + body + '</li>';
        }).join('');
        return '<section class="sb-section sb-section-soft" id="' + esc(b.anchor || '') + '"><div class="sb-container">' +
          head(b) + '<ul class="sb-grid sb-cols-' + pick(['1', '2', '3', '4'], b.cols, '3') + '">' + cards + '</ul></div></section>';
      }
    },

    {
      type: 'features', name: 'Преимущества', icon: '✓', group: 'Контент',
      desc: 'Список с галочками в две колонки',
      fields: [
        { k: 'title', label: 'Заголовок', type: 'text' },
        { k: 'items', label: 'Пункты', type: 'list', itemLabel: 'Пункт', of: [
          { k: 'title', label: 'Название', type: 'text' },
          { k: 'text', label: 'Пояснение', type: 'textarea' }
        ]}
      ],
      defaults: {
        title: 'Почему это работает',
        items: [
          { title: 'Никакого кода', text: 'Только перетаскивание блоков и поля для текста.' },
          { title: 'Любые цвета', text: 'Акцент, фон, шрифт, скругления — на ваш вкус.' },
          { title: 'Ссылка сразу', text: 'Публикация в GitHub Pages и готовый адрес.' }
        ]
      },
      render: function (b) {
        var items = (b.items || []).map(function (it) {
          return '<li class="sb-feature"><span class="sb-check">✓</span><div><h3>' + esc(it.title) + '</h3>' +
            (it.text ? '<p>' + md(it.text) + '</p>' : '') + '</div></li>';
        }).join('');
        return '<section class="sb-section"><div class="sb-container">' + head(b) +
          '<ul class="sb-features">' + items + '</ul></div></section>';
      }
    },

    {
      type: 'gallery', name: 'Галерея', icon: '◫', group: 'Контент',
      desc: 'Сетка изображений',
      fields: [
        { k: 'title', label: 'Заголовок', type: 'text' },
        { k: 'cols', label: 'Колонок', type: 'select', options: ['2', '3', '4'], labels: ['2', '3', '4'] },
        { k: 'items', label: 'Картинки', type: 'list', itemLabel: 'Картинка', of: [
          { k: 'src', label: 'Изображение', type: 'image' },
          { k: 'caption', label: 'Подпись', type: 'text' }
        ]}
      ],
      defaults: { title: 'Работы', cols: '3', items: [{ src: '', caption: '' }, { src: '', caption: '' }, { src: '', caption: '' }] },
      render: function (b) {
        var cells = (b.items || []).map(function (it) {
          if (!it.src) return '<li class="sb-shot sb-shot-empty">+</li>';
          return '<li class="sb-shot">' + (it.caption
            ? '<a href="' + esc(it.src) + '"><img src="' + esc(it.src) + '" alt="' + esc(it.caption) + '" loading="lazy"><span>' + esc(it.caption) + '</span></a>'
            : '<img src="' + esc(it.src) + '" alt="" loading="lazy">') + '</li>';
        }).join('');
        return '<section class="sb-section sb-section-soft"><div class="sb-container">' + head(b) +
          '<ul class="sb-gallery sb-cols-' + pick(['2', '3', '4'], b.cols, '3') + '">' + cells + '</ul></div></section>';
      }
    },

    {
      type: 'stats', name: 'Цифры', icon: '#', group: 'Контент',
      desc: 'Ключевые показатели',
      fields: [
        { k: 'items', label: 'Показатели', type: 'list', itemLabel: 'Показатель', of: [
          { k: 'value', label: 'Значение', type: 'text' },
          { k: 'label', label: 'Подпись', type: 'text' }
        ]}
      ],
      defaults: { items: [{ value: '0 ₽', label: 'стоимость хостинга' }, { value: '1 день', label: 'до публикации' }, { value: '∞', label: 'правок' }] },
      render: function (b) {
        var items = (b.items || []).map(function (it) {
          return '<div class="sb-stat sb-reveal"><b>' + esc(it.value) + '</b><span>' + esc(it.label) + '</span></div>';
        }).join('');
        return '<section class="sb-section"><div class="sb-container"><ul class="sb-stats">' + items + '</ul></div></section>';
      }
    },

    {
      type: 'pricing', name: 'Тарифы', icon: '¤', group: 'Контент',
      desc: 'Карточки с ценой',
      fields: [
        { k: 'title', label: 'Заголовок', type: 'text' },
        { k: 'items', label: 'Тарифы', type: 'list', itemLabel: 'Тариф', of: [
          { k: 'name', label: 'Название', type: 'text' },
          { k: 'price', label: 'Цена', type: 'text' },
          { k: 'period', label: 'Период', type: 'text' },
          { k: 'features', label: 'Пункты (по строке)', type: 'textarea' },
          { k: 'featured', label: 'Выделенный', type: 'bool' },
          { k: 'cta', label: 'Текст кнопки', type: 'text' },
          { k: 'href', label: 'Ссылка кнопки', type: 'url' }
        ]}
      ],
      defaults: {
        title: 'Тарифы',
        items: [
          { name: 'Старт', price: '0 ₽', period: 'навсегда', features: 'Один сайт\nГотовые блоки\nСсылка на GitHub', featured: true, cta: 'Сделать сайт', href: '#' },
          { name: 'Плюс', price: '500 ₽', period: 'разово', features: 'Всё из «Старт»\nСвой домен\nПравки без лимита', featured: false, cta: 'Обсудить', href: '#contacts' }
        ]
      },
      render: function (b) {
        var cards = (b.items || []).map(function (it, i) {
          var feats = String(it.features || '').split('\n').filter(function (x) { return x.trim(); })
            .map(function (x) { return '<li>' + md(x.trim()) + '</li>'; }).join('');
          return '<li class="sb-price sb-reveal' + (it.featured ? ' sb-price-hot' : '') + '" style="--d:' + i * 70 + 'ms">' +
            (it.featured ? '<span class="sb-badge">выбор</span>' : '') +
            '<h3>' + esc(it.name) + '</h3><div class="sb-price-num">' + esc(it.price) +
            (it.period ? '<small>' + esc(it.period) + '</small>' : '') + '</div>' +
            '<ul class="sb-price-list">' + feats + '</ul>' +
            (it.cta ? '<a class="sb-btn ' + (it.featured ? 'sb-btn-solid' : 'sb-btn-ghost') + '" href="' +
              esc(safeUrl(it.href) || '#') + '">' + esc(it.cta) + '</a>' : '') + '</li>';
        }).join('');
        return '<section class="sb-section sb-section-soft" id="pricing"><div class="sb-container">' + head(b) +
          '<ul class="sb-prices">' + cards + '</ul></div></section>';
      }
    },

    {
      type: 'cta', name: 'Призыв', icon: '➤', group: 'Контент',
      desc: 'Яркая полоса с кнопкой',
      fields: [
        { k: 'title', label: 'Заголовок', type: 'text' },
        { k: 'text', label: 'Текст', type: 'textarea' },
        { k: 'cta', label: 'Текст кнопки', type: 'text' },
        { k: 'href', label: 'Ссылка', type: 'url' },
        { k: 'anchor', label: 'Якорь для меню', type: 'text' }
      ],
      defaults: { title: 'Готовы начать?', text: 'Соберите сайт бесплатно — это занимает вечер.', cta: 'Начать', href: '#', anchor: 'cta' },
      render: function (b) {
        return '<section class="sb-cta" id="' + esc(b.anchor || '') + '"><div class="sb-container sb-cta-in">' +
          '<div><h2>' + esc(b.title) + '</h2>' + (b.text ? '<p>' + md(b.text) + '</p>' : '') + '</div>' +
          (b.cta ? '<a class="sb-btn sb-btn-solid sb-btn-lg" href="' + esc(safeUrl(b.href) || '#') + '">' + esc(b.cta) + '</a>' : '') +
          '</div></section>';
      }
    },

    {
      type: 'quote', name: 'Цитата', icon: '❝', group: 'Контент',
      desc: 'Отзыв клиента',
      fields: [
        { k: 'text', label: 'Цитата', type: 'textarea' },
        { k: 'author', label: 'Автор', type: 'text' },
        { k: 'role', label: 'Роль / компания', type: 'text' }
      ],
      defaults: { text: 'Сайт собрал за вечер, без единой строки кода. Работает быстро и выглядит дорого.', author: 'Иван Петров', role: 'основатель студии' },
      render: function (b) {
        return '<section class="sb-section"><div class="sb-container"><figure class="sb-quote">' +
          '<blockquote>' + md(b.text) + '</blockquote>' +
          '<figcaption>' + esc(b.author) + (b.role ? '<span>' + esc(b.role) + '</span>' : '') + '</figcaption>' +
          '</figure></div></section>';
      }
    },

    {
      type: 'faq', name: 'Вопросы', icon: '?', group: 'Контент',
      desc: 'Аккордеон вопрос-ответ',
      fields: [
        { k: 'title', label: 'Заголовок', type: 'text' },
        { k: 'items', label: 'Вопросы', type: 'list', itemLabel: 'Вопрос', of: [
          { k: 'q', label: 'Вопрос', type: 'text' },
          { k: 'a', label: 'Ответ', type: 'textarea' }
        ]}
      ],
      defaults: {
        title: 'Частые вопросы',
        items: [
          { q: 'Это бесплатно?', a: 'Да. Хостинг GitHub Pages бесплатный для публичных репозиториев.' },
          { q: 'Нужен ли код?', a: 'Нет. Сайт собирается перетаскиванием блоков и заполнением полей.' }
        ]
      },
      render: function (b) {
        var items = (b.items || []).map(function (it) {
          return '<details class="sb-faq-item"><summary>' + esc(it.q) + '</summary><div class="sb-faq-a">' +
            paras(it.a) + '</div></details>';
        }).join('');
        return '<section class="sb-section"><div class="sb-container sb-narrow">' + head(b) + items + '</div></section>';
      }
    },

    {
      type: 'video', name: 'Видео', icon: '▶', group: 'Контент',
      desc: 'YouTube / Vimeo / файл',
      fields: [
        { k: 'url', label: 'Ссылка или файл', type: 'url' },
        { k: 'caption', label: 'Подпись', type: 'text' }
      ],
      defaults: { url: '', caption: '' },
      render: function (b) {
        var u = String(b.url || '').trim();
        var embed = '';
        var y = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/.exec(u);
        var v = /vimeo\.com\/(?:video\/)?(\d+)/.exec(u);
        if (y) embed = '<iframe src="https://www.youtube-nocookie.com/embed/' + esc(y[1]) + '" title="' + esc(b.caption || 'video') + '" loading="lazy" allowfullscreen></iframe>';
        else if (v) embed = '<iframe src="https://player.vimeo.com/video/' + esc(v[1]) + '" title="' + esc(b.caption || 'video') + '" loading="lazy" allowfullscreen></iframe>';
        else if (u) embed = '<video src="' + esc(u) + '" controls playsinline></video>';
        if (!embed) embed = '<div class="sb-img sb-img-empty sb-img-ratio-16x9">Вставьте ссылку на YouTube, Vimeo или файл</div>';
        return '<figure class="sb-figure"><div class="sb-video">' + embed + '</div>' +
          (b.caption ? '<figcaption>' + esc(b.caption) + '</figcaption>' : '') + '</figure>';
      }
    },

    {
      type: 'contact', name: 'Контакты', icon: '@', group: 'Контент',
      desc: 'Кнопки связи и реквизиты',
      fields: [
        { k: 'title', label: 'Заголовок', type: 'text' },
        { k: 'text', label: 'Текст', type: 'textarea' },
        { k: 'items', label: 'Способы связи', type: 'list', itemLabel: 'Контакт', of: [
          { k: 'icon', label: 'Иконка', type: 'text' },
          { k: 'label', label: 'Подпись', type: 'text' },
          { k: 'value', label: 'Значение / ссылка', type: 'text' }
        ]},
        { k: 'form', label: 'Показать форму (без отправки)', type: 'bool' },
        { k: 'anchor', label: 'Якорь для меню', type: 'text' }
      ],
      defaults: {
        title: 'Свяжитесь', text: 'Отвечаю в течение дня.',
        items: [
          { icon: '✉', label: 'Почта', value: 'mailto:hello@example.com' },
          { icon: '✈', label: 'Telegram', value: 'https://t.me/example' }
        ], form: true, anchor: 'contacts'
      },
      render: function (b) {
        var items = (b.items || []).map(function (it) {
          var v = String(it.value || '');
          var href = safeUrl(v) || (v.indexOf('@') > 0 && !/\s/.test(v) ? 'mailto:' + v : '');
          var body = '<span class="sb-contact-ico">' + esc(it.icon || '•') + '</span>' +
            '<div><span class="sb-contact-label">' + esc(it.label) + '</span><span class="sb-contact-val">' + esc(v.replace(/^mailto:|^https?:\/\//, '')) + '</span></div>';
          return '<li>' + (href ? '<a href="' + esc(href) + '">' + body + '</a>' : '<div>' + body + '</div>') + '</li>';
        }).join('');
        var form = b.form ?
          '<form class="sb-form" onsubmit="return false"><label>Имя<input name="n" required></label>' +
          '<label>Сообщение<textarea name="m" rows="4" required></textarea></label>' +
          '<button class="sb-btn sb-btn-solid" type="submit">Отправить</button>' +
          '<p class="sb-form-note">Форма-заглушка: подключите свой обработчик или замените на ссылку в настройках контактов.</p></form>' : '';
        return '<section class="sb-section sb-section-soft" id="' + esc(b.anchor || '') + '"><div class="sb-container sb-contact">' +
          '<div>' + head(b) + '<ul class="sb-contacts">' + items + '</ul></div>' + form + '</div></section>';
      }
    },

    {
      type: 'divider', name: 'Разделитель', icon: '—', group: 'Разметка',
      desc: 'Тонкая линия между блоками',
      fields: [{ k: 'label', label: 'Надпись', type: 'text' }],
      defaults: { label: '' },
      render: function (b) {
        return '<div class="sb-divider sb-container">' +
          (b.label ? '<span>' + esc(b.label) + '</span>' : '') + '</div>';
      }
    },

    {
      type: 'spacer', name: 'Отступ', icon: '↕', group: 'Разметка',
      desc: 'Пустое пространство',
      fields: [{ k: 'size', label: 'Размер', type: 'select', options: ['1', '2', '3', '4'], labels: ['Маленький', 'Средний', 'Большой', 'Огромный'] }],
      defaults: { size: '2' },
      render: function (b) {
        return '<div class="sb-spacer sb-sp-' + pick(['1', '2', '3', '4'], b.size, '2') + '"></div>';
      }
    },

    {
      type: 'footer', name: 'Подвал', icon: '▂', group: 'Шапка',
      desc: 'Копирайт и ссылки',
      fields: [
        { k: 'text', label: 'Текст', type: 'textarea' },
        { k: 'links', label: 'Ссылки', type: 'links' },
        { k: 'year', label: 'Показывать текущий год', type: 'bool' }
      ],
      defaults: {
        text: 'Сделано в САЙТСТРОЙ', year: true,
        links: [{ label: 'Telegram', href: 'https://t.me/example' }, { label: 'GitHub', href: 'https://github.com' }]
      },
      render: function (b, t, project) {
        var links = (b.links || []).map(function (l) {
          return '<li><a href="' + esc(safeUrl(l.href) || '#') + '">' + esc(l.label) + '</a></li>';
        }).join('');
        return '<footer class="sb-footer"><div class="sb-container sb-footer-in">' +
          '<p>' + md(b.text) + (b.year ? ' <span class="sb-year">' + esc(project.year || new Date().getFullYear()) + '</span>' : '') + '</p>' +
          (links ? '<ul>' + links + '</ul>' : '') + '</div></footer>';
      }
    }
  ];

  function head(b) {
    return '<header class="sb-sec-head">' +
      (b.title ? '<h2 class="sb-h2">' + esc(b.title) + '</h2>' : '') +
      (b.sub ? '<p class="sb-lead">' + md(b.sub) + '</p>' : '') + '</header>';
  }

  SB.blockByType = function (t) {
    for (var i = 0; i < SB.BLOCKS.length; i++) if (SB.BLOCKS[i].type === t) return SB.BLOCKS[i];
    return null;
  };

  SB.cloneDefaults = function (type) {
    var d = SB.blockByType(type);
    return d ? JSON.parse(JSON.stringify(d.defaults)) : {};
  };

  /* ---------- рендер страницы ---------- */

  SB.renderBlocks = function (blocks, project) {
    return (blocks || []).map(function (b) {
      var def = SB.blockByType(b.type);
      if (!def) return '';
      try {
        return def.render(b, (project || {}).theme, project || {});
      } catch (e) {
        return '';
      }
    }).join('\n');
  };

  SB.renderBlocksFor = function (blocks, project) {
    return SB.renderBlocks(blocks, project);
  };

  /* ---------- CSS темы ---------- */

  SB.themeCSS = function (t) {
    var c = themeColors(t);
    var font = SB.FONTS[t.font] || SB.FONTS.sans;
    var radius = Math.max(0, Math.min(34, Number(t.radius) || 0));
    var container = Math.max(820, Math.min(1440, Number(t.container) || 1140));
    var gap = Math.max(28, Math.min(140, Number(t.gap) || 72));
    var shadow = t.shadows === false ? 'none' : '0 10px 30px ' + (isDark(c.bg) ? 'rgba(0,0,0,.45)' : 'rgba(15,23,42,.10)');
    var onAccent = isDark(t.accent) ? '#fff' : '#0a0a0a';

    return [
      ':root{',
      '--accent:' + t.accent + ';--accent2:' + t.accent2 + ';--on-accent:' + onAccent + ';',
      '--bg:' + c.bg + ';--bg-soft:' + c.bgSoft + ';--surface:' + c.surface + ';',
      '--text:' + c.text + ';--muted:' + c.muted + ';--border:' + c.border + ';',
      '--radius:' + radius + 'px;--radius-sm:' + Math.round(radius * 0.6) + 'px;',
      '--container:' + container + 'px;--gap:' + gap + 'px;--shadow:' + shadow + ';',
      '--font:' + font + ';',
      '}',
      '*,*::before,*::after{box-sizing:border-box}',
      'html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}',
      'body{margin:0;font-family:var(--font);background:var(--bg);color:var(--text);',
      'line-height:1.65;-webkit-font-smoothing:antialiased;overflow-x:hidden}',
      'img{max-width:100%;display:block}',
      'a{color:inherit;text-decoration:none}',
      'h1,h2,h3{margin:0;line-height:1.15;letter-spacing:-.02em;font-weight:800}',
      'p{margin:0}',
      'ul,ol{margin:0;padding:0;list-style:none}',
      '::selection{background:var(--accent);color:var(--on-accent)}',
      '.sb-container{width:min(100% - 2.5rem,var(--container));margin-inline:auto}',
      '.sb-page{container-type:inline-size}',
      '.sb-narrow{width:min(100% - 2.5rem,760px)}',
      '.sb-section{padding-block:calc(var(--gap) * .7)}',
      '.sb-section-soft{background:var(--bg-soft)}',
      '.sb-align-center{text-align:center}',
      '.sb-align-center .sb-lead,.sb-align-center .sb-hero-sub{margin-inline:auto}',
      '.sb-align-right{text-align:right}',
      '.sb-h2{font-size:clamp(1.6rem,4vw,2.6rem)}',
      '.sb-lead{color:var(--muted);font-size:1.03rem;margin-top:.7rem;max-width:60ch}',
      '.sb-sec-head{margin-bottom:2.2rem}',
      '.sb-eyebrow{display:inline-block;font-size:.8rem;font-weight:700;letter-spacing:.16em;',
      'text-transform:uppercase;color:var(--accent);margin-bottom:1rem}',
      '.sb-prose{max-width:72ch}',
      '.sb-prose-narrow{max-width:52ch}',
      '.sb-prose-wide{max-width:none}',
      '.sb-prose p{margin:0 0 1.1rem;color:var(--muted)}',
      '.sb-prose p:last-child{margin-bottom:0}',
      '.sb-prose strong{color:var(--text)}',
      '.sb-prose a,.sb-faq-a a{color:var(--accent);text-decoration:underline;text-underline-offset:3px}',
      '.sb-prose code{background:var(--bg-soft);border:1px solid var(--border);border-radius:6px;',
      'padding:.15em .4em;font-size:.9em;font-family:ui-monospace,Menlo,Consolas,monospace}',
      /* кнопки */
      '.sb-btn{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;',
      'padding:.75rem 1.4rem;border-radius:999px;font-weight:700;font-size:.95rem;border:1px solid transparent;',
      'cursor:pointer;transition:transform .18s ease,filter .18s ease,box-shadow .18s ease;white-space:nowrap}',
      '.sb-btn:hover{transform:translateY(-2px)}',
      '.sb-btn-solid{background:linear-gradient(135deg,var(--accent),var(--accent2));color:var(--on-accent);',
      'box-shadow:0 8px 24px ' + (isDark(t.accent) ? 'color-mix(in srgb,var(--accent) 35%,transparent)' : 'rgba(0,0,0,.18)') + '}',
      '.sb-btn-solid:hover{filter:brightness(1.08)}',
      '.sb-btn-ghost{border-color:var(--border);color:var(--text);background:transparent}',
      '.sb-btn-ghost:hover{border-color:var(--accent);color:var(--accent)}',
      '.sb-btn-lg{padding:.95rem 1.9rem;font-size:1rem}',
      /* меню */
      '.sb-nav{position:relative;z-index:30;border-bottom:1px solid var(--border)}',
      '.sb-nav-sticky{position:sticky;top:0}',
      '.sb-nav-solid{background:var(--bg)}',
      '.sb-nav-blur{background:color-mix(in srgb,var(--bg) 78%,transparent);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}',
      '.sb-nav-in{display:flex;align-items:center;gap:1rem;min-height:68px}',
      '.sb-brand{display:inline-flex;align-items:center;gap:.6rem;font-weight:800;font-size:1.05rem;letter-spacing:-.01em}',
      '.sb-brand-mark{width:34px;height:34px;border-radius:calc(var(--radius-sm) * .7);display:grid;place-items:center;',
      'background:linear-gradient(135deg,var(--accent),var(--accent2));color:var(--on-accent);font-size:.95rem}',
      '.sb-brand-img{width:34px;height:34px;object-fit:cover;border-radius:calc(var(--radius-sm) * .7)}',
      '.sb-nav-links{display:flex;align-items:center;gap:1.4rem;margin-left:auto}',
      '.sb-nav-links ul{display:flex;gap:1.4rem}',
      '.sb-nav-links a:not(.sb-btn){color:var(--muted);font-size:.95rem;font-weight:600;transition:color .15s}',
      '.sb-nav-links a:not(.sb-btn):hover{color:var(--accent)}',
      '.sb-burger-host{display:none;margin-left:auto;background:none;border:0;padding:.4rem;cursor:pointer}',
      '.sb-burger{display:grid;gap:4px;width:24px}',
      '.sb-burger i{display:block;height:2px;background:var(--text);border-radius:2px;transition:transform .2s,opacity .2s}',
      /* первый экран */
      '.sb-hero{position:relative;display:flex;align-items:center;overflow:hidden}',
      '.sb-hero-compact{min-height:44vh}.sb-hero-normal{min-height:62vh}.sb-hero-tall{min-height:78vh}.sb-hero-full{min-height:calc(100dvh - 68px)}',
      '.sb-hero-in{position:relative;z-index:2;width:100%;padding-block:calc(var(--gap) * 1.2)}',
      '.sb-hero-title{font-size:clamp(2.1rem,6vw,4rem);max-width:22ch}',
      '.sb-align-center .sb-hero-title{margin-inline:auto}',
      '.sb-hero-sub{color:var(--muted);font-size:clamp(1rem,2vw,1.2rem);margin-top:1.2rem;max-width:58ch}',
      '.sb-hero-btns{display:flex;flex-wrap:wrap;gap:.8rem;margin-top:2rem}',
      '.sb-align-center .sb-hero-btns{justify-content:center}',
      '.sb-align-right .sb-hero-btns{justify-content:flex-end}',
      '.sb-hero-veil{position:absolute;inset:0;background:linear-gradient(180deg,var(--bg),color-mix(in srgb,var(--bg) 72%,transparent))}',
      '.sb-hero-has-img .sb-hero-veil{background:linear-gradient(180deg,color-mix(in srgb,var(--bg) 55%,transparent),var(--bg))}',
      /* карточки */
      '.sb-grid{display:grid;gap:1.4rem}',
      '.sb-cols-1{grid-template-columns:1fr}.sb-cols-2{grid-template-columns:repeat(2,1fr)}',
      '.sb-cols-3{grid-template-columns:repeat(3,1fr)}.sb-cols-4{grid-template-columns:repeat(4,1fr)}',
      '.sb-card{display:block;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);',
      'padding:1.7rem;box-shadow:var(--shadow);transition:transform .2s ease,border-color .2s ease;height:100%}',
      'a.sb-card:hover{transform:translateY(-4px);border-color:var(--accent)}',
      '.sb-card-icon{display:inline-grid;place-items:center;width:46px;height:46px;border-radius:calc(var(--radius-sm) * .8);',
      'background:color-mix(in srgb,var(--accent) 16%,transparent);font-size:1.4rem;margin-bottom:1rem}',
      '.sb-card h3{font-size:1.15rem;margin-bottom:.6rem}',
      '.sb-card p{color:var(--muted);font-size:.95rem}',
      /* преимущества */
      '.sb-features{display:grid;gap:1.2rem;grid-template-columns:repeat(2,1fr)}',
      '.sb-feature{display:flex;gap:1rem;background:var(--surface);border:1px solid var(--border);',
      'border-radius:var(--radius);padding:1.4rem}',
      '.sb-check{flex:0 0 28px;height:28px;border-radius:50%;display:grid;place-items:center;font-size:.9rem;font-weight:800;',
      'background:linear-gradient(135deg,var(--accent),var(--accent2));color:var(--on-accent)}',
      '.sb-feature h3{font-size:1.02rem;margin-bottom:.35rem}',
      '.sb-feature p{color:var(--muted);font-size:.94rem}',
      /* галерея */
      '.sb-gallery{display:grid;gap:1rem}',
      '.sb-shot{border-radius:var(--radius);overflow:hidden;background:var(--surface);border:1px solid var(--border);position:relative}',
      '.sb-shot img{width:100%;aspect-ratio:4/3;object-fit:cover;transition:transform .35s ease}',
      '.sb-shot a:hover img{transform:scale(1.05)}',
      '.sb-shot span{position:absolute;left:0;right:0;bottom:0;padding:1.6rem .9rem .7rem;font-size:.85rem;font-weight:600;',
      'background:linear-gradient(transparent,rgba(0,0,0,.65));color:#fff}',
      '.sb-shot-empty{display:grid;place-items:center;aspect-ratio:4/3;color:var(--muted);font-size:1.8rem;',
      'border-style:dashed;background:var(--bg-soft)}',
      /* цифры */
      '.sb-stats{display:grid;gap:1.4rem;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));text-align:center}',
      '.sb-stat b{display:block;font-size:clamp(2rem,5vw,3rem);letter-spacing:-.03em;',
      'background:linear-gradient(135deg,var(--accent),var(--accent2));-webkit-background-clip:text;background-clip:text;color:transparent}',
      '.sb-stat span{color:var(--muted);font-size:.92rem}',
      /* тарифы */
      '.sb-prices{display:grid;gap:1.4rem;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));align-items:stretch}',
      '.sb-price{position:relative;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);',
      'padding:2rem 1.7rem;display:flex;flex-direction:column;gap:1rem;box-shadow:var(--shadow)}',
      '.sb-price-hot{border-color:var(--accent);transform:translateY(-6px)}',
      '.sb-badge{position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,var(--accent),var(--accent2));',
      'color:var(--on-accent);font-size:.7rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;padding:.3rem .7rem;border-radius:999px}',
      '.sb-price h3{font-size:1rem;color:var(--muted);text-transform:uppercase;letter-spacing:.1em}',
      '.sb-price-num{font-size:2.4rem;font-weight:800;letter-spacing:-.03em}',
      '.sb-price-num small{display:block;font-size:.85rem;font-weight:600;color:var(--muted)}',
      '.sb-price-list{flex:1;display:grid;gap:.6rem;color:var(--muted);font-size:.93rem}',
      '.sb-price-list li{position:relative;padding-left:1.5rem}',
      '.sb-price-list li::before{content:"✓";position:absolute;left:0;color:var(--accent);font-weight:800}',
      /* призыв */
      '.sb-cta{background:linear-gradient(135deg,var(--accent),var(--accent2));color:var(--on-accent)}',
      '.sb-cta h2{font-size:clamp(1.5rem,3.6vw,2.3rem)}',
      '.sb-cta p{margin-top:.7rem;opacity:.85;max-width:52ch}',
      '.sb-cta-in{display:flex;align-items:center;justify-content:space-between;gap:2rem;flex-wrap:wrap;',
      'padding-block:calc(var(--gap) * .85)}',
      '.sb-cta .sb-btn-solid{background:var(--bg);color:var(--text);box-shadow:none}',
      /* цитата */
      '.sb-quote{margin:0;max-width:60ch}',
      '.sb-quote blockquote{margin:0;font-size:clamp(1.2rem,2.6vw,1.7rem);line-height:1.4;font-weight:600;letter-spacing:-.01em}',
      '.sb-quote figcaption{margin-top:1.4rem;color:var(--muted);font-size:.9rem;display:flex;flex-direction:column}',
      '.sb-quote figcaption span{opacity:.7}',
      /* faq */
      '.sb-faq-item{border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface);margin-bottom:.7rem;overflow:hidden}',
      '.sb-faq-item summary{cursor:pointer;padding:1.1rem 1.3rem;font-weight:700;list-style:none;display:flex;',
      'align-items:center;justify-content:space-between;gap:1rem}',
      '.sb-faq-item summary::-webkit-details-marker{display:none}',
      '.sb-faq-item summary::after{content:"+";color:var(--accent);font-size:1.3rem;line-height:1;transition:transform .2s}',
      '.sb-faq-item[open] summary::after{content:"−"}',
      '.sb-faq-a{padding:0 1.3rem 1.2rem;color:var(--muted);font-size:.95rem}',
      '.sb-faq-a p{margin-bottom:.8rem}',
      /* медиа */
      '.sb-figure{margin:0;padding-inline:max(1.25rem,calc((100cqw - var(--container)) / 2))}',
      '.sb-figure figcaption{margin-top:.8rem;color:var(--muted);font-size:.87rem;text-align:center}',
      '.sb-img{overflow:hidden;border-radius:var(--radius);background:var(--bg-soft);border:1px solid var(--border)}',
      '.sb-img img{width:100%;height:100%;object-fit:cover}',
      '.sb-img-cover img{object-fit:cover}.sb-img-contain img{object-fit:contain}',
      '.sb-img-auto{height:auto}.sb-img-ratio-16x9{aspect-ratio:16/9}.sb-img-ratio-4x3{aspect-ratio:4/3}.sb-img-ratio-1x1{aspect-ratio:1/1}',
      '.sb-img-ratio-auto{height:auto}.sb-img-ratio-auto img{height:auto;object-fit:contain}',
      '.sb-img-r-theme{border-radius:var(--radius)}.sb-img-r-soft{border-radius:calc(var(--radius) * .4)}',
      '.sb-img-r-round{border-radius:999px}.sb-img-r-none{border-radius:0}',
      '.sb-img-empty{display:grid;place-items:center;color:var(--muted);font-size:.9rem;border-style:dashed}',
      '.sb-video{position:relative;aspect-ratio:16/9;border-radius:var(--radius);overflow:hidden;background:#000;border:1px solid var(--border)}',
      '.sb-video iframe,.sb-video video{position:absolute;inset:0;width:100%;height:100%;border:0}',
      /* контакты */
      '.sb-contact{display:grid;gap:2.5rem;grid-template-columns:1.1fr .9fr;align-items:start}',
      '.sb-contacts{display:grid;gap:.8rem;margin-top:1.6rem}',
      '.sb-contacts li a,.sb-contacts li>div{display:flex;gap:.9rem;align-items:center;background:var(--surface);',
      'border:1px solid var(--border);border-radius:var(--radius-sm);padding:.9rem 1.1rem;transition:border-color .15s}',
      '.sb-contacts li a:hover{border-color:var(--accent)}',
      '.sb-contact-ico{width:38px;height:38px;border-radius:calc(var(--radius-sm) * .7);display:grid;place-items:center;',
      'background:color-mix(in srgb,var(--accent) 16%,transparent)}',
      '.sb-contact-label{display:block;font-size:.78rem;color:var(--muted);text-transform:uppercase;letter-spacing:.08em}',
      '.sb-contact-val{display:block;font-weight:700;word-break:break-word}',
      '.sb-form{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:1.6rem;display:grid;gap:.9rem}',
      '.sb-form label{display:grid;gap:.4rem;font-size:.82rem;color:var(--muted);font-weight:600}',
      '.sb-form input,.sb-form textarea{width:100%;font:inherit;color:var(--text);background:var(--bg);',
      'border:1px solid var(--border);border-radius:var(--radius-sm);padding:.7rem .85rem;outline:none;resize:vertical}',
      '.sb-form input:focus,.sb-form textarea:focus{border-color:var(--accent)}',
      '.sb-form-note{margin:0;font-size:.75rem;color:var(--muted);opacity:.8;line-height:1.5}',
      /* разметка */
      '.sb-divider{display:flex;align-items:center;gap:1rem;color:var(--muted);font-size:.85rem;padding-block:1rem}',
      '.sb-divider::before,.sb-divider::after{content:"";flex:1;height:1px;background:var(--border)}',
      '.sb-divider:not(:has(span))::after{display:none}',
      '.sb-spacer{height:1px}.sb-sp-1{height:calc(var(--gap) * .35)}.sb-sp-2{height:calc(var(--gap) * .7)}',
      '.sb-sp-3{height:var(--gap)}.sb-sp-4{height:calc(var(--gap) * 1.6)}',
      /* подвал */
      '.sb-footer{border-top:1px solid var(--border);background:var(--bg-soft);padding-block:2.2rem;font-size:.9rem}',
      '.sb-footer-in{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap}',
      '.sb-footer p{color:var(--muted)}',
      '.sb-footer ul{display:flex;gap:1.2rem;flex-wrap:wrap}',
      '.sb-footer a{color:var(--muted);font-weight:600}',
      '.sb-footer a:hover{color:var(--accent)}',
      /* анимация появления */
      t.reveal === false ? '' :
      '.sb-reveal{opacity:0;transform:translateY(18px);transition:opacity .6s ease var(--d,0ms),transform .6s ease var(--d,0ms)}' +
      '.sb-reveal.sb-in{opacity:1;transform:none}',
      '@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}*,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important}',
      '.sb-reveal{opacity:1!important;transform:none!important}}',
      /* адаптив через container queries: работает и в обычной странице,
         и внутри редактора, где ширина задана превью устройства */
      '@container (max-width:900px){',
      '.sb-cols-3,.sb-cols-4{grid-template-columns:repeat(2,1fr)}',
      '.sb-features,.sb-contact{grid-template-columns:1fr}',
      '.sb-price-hot{transform:none}',
      '}',
      '@container (max-width:720px){',
      '.sb-nav-links{position:absolute;top:100%;left:0;right:0;flex-direction:column;align-items:stretch;gap:.4rem;',
      'background:var(--bg);border-bottom:1px solid var(--border);padding:1rem 1.25rem 1.4rem;display:none}',
      '.sb-nav.sb-open .sb-nav-links{display:flex}',
      '.sb-nav.sb-open .sb-nav-links a:not(.sb-btn){padding:.55rem 0}',
      '.sb-burger-host{display:block}',
      '.sb-burger i:nth-child(1).sb-x{transform:translateY(6px) rotate(45deg)}',
      '.sb-burger i:nth-child(2).sb-x{opacity:0}',
      '.sb-burger i:nth-child(3).sb-x{transform:translateY(-6px) rotate(-45deg)}',
      '.sb-cols-2,.sb-cols-3,.sb-cols-4{grid-template-columns:1fr}',
      '.sb-gallery{grid-template-columns:1fr}',
      '.sb-hero-in{padding-block:calc(var(--gap) * .8)}',
      '.sb-hero-btns .sb-btn{flex:1 1 auto}',
      '.sb-footer-in{flex-direction:column;align-items:flex-start}',
      '}'
    ].join('\n');
  };

  /* ---------- сборка готовой страницы ---------- */

  SB.RUNTIME_JS = [
    '(function(){',
    'var d=document;',
    'd.querySelectorAll(".sb-nav").forEach(function(nav){',
    'var b=nav.querySelector(".sb-burger-host");',
    'if(!b)return;',
    'b.addEventListener("click",function(){',
    'var open=nav.classList.toggle("sb-open");',
    'b.setAttribute("aria-expanded",String(open));',
    'var i=nav.querySelector(".sb-burger");if(i){i.querySelectorAll("i").forEach(function(s){s.classList.toggle("sb-x",open);});}',
    '});',
    'nav.querySelectorAll(".sb-nav-links a").forEach(function(a){',
    'a.addEventListener("click",function(){nav.classList.remove("sb-open");',
    'var i=nav.querySelector(".sb-burger");if(i){i.querySelectorAll("i").forEach(function(s){s.classList.remove("sb-x");});}',
    'b.setAttribute("aria-expanded","false");});',
    '});',
    '});',
    'var yo=d.querySelectorAll(".sb-year");',
    'yo.forEach(function(y){y.textContent=String(new Date().getFullYear());});',
    'var rev=d.querySelectorAll(".sb-reveal");',
    'if(!rev.length||!("IntersectionObserver" in window)){',
    'rev.forEach(function(e){e.classList.add("sb-in")});',
    '}else{',
    'var io=new IntersectionObserver(function(es){',
    'es.forEach(function(e){if(e.isIntersecting){e.target.classList.add("sb-in");io.unobserve(e.target);}});',
    '},{rootMargin:"0px 0px -8% 0px",threshold:.1});',
    'rev.forEach(function(e){io.observe(e)});',
    '}',
    'd.querySelectorAll(\'a[href^="#"]\').forEach(function(a){',
    'var id=a.getAttribute("href");',
    'if(id.length<2)return;',
    'a.addEventListener("click",function(ev){',
    'var t=d.querySelector(id);',
    'if(!t)return;',
    'ev.preventDefault();',
    'var y=t.getBoundingClientRect().top+window.scrollY-(t.tagName==="HEADER"?70:20);',
    'window.scrollTo({top:y,behavior:"smooth"});',
    '});',
    '});',
    '})();'
  ].join('\n');

  function faviconData(t) {
    var ch = (t.title || 'S').slice(0, 1).toUpperCase();
    var svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>" +
      "<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>" +
      "<stop offset='0' stop-color='" + t.accent + "'/><stop offset='1' stop-color='" + t.accent2 + "'/>" +
      "</linearGradient></defs>" +
      "<rect width='64' height='64' rx='16' fill='url(#g)'/>" +
      "<text x='32' y='44' font-family='system-ui,sans-serif' font-size='34' font-weight='800' " +
      "text-anchor='middle' fill='" + (isDark(t.accent) ? '#fff' : '#0a0a0a') + "'>" + esc(ch) + "</text></svg>";
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  }

  SB.buildPage = function (project) {
    var p = project || {};
    var t = p.theme || SB.newTheme();
    var title = p.title || 'Сайт';
    var desc = p.description || '';
    var body = SB.renderBlocksFor(p.blocks || [], p);
    var hero = (p.blocks || []).find(function (b) { return b.type === 'hero'; });

    return '<!DOCTYPE html>\n<html lang="' + esc(p.lang || 'ru') + '">\n<head>\n' +
      '<meta charset="utf-8">\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
      '<title>' + esc(title) + '</title>\n' +
      (desc ? '<meta name="description" content="' + esc(desc) + '">\n' : '') +
      '<meta property="og:type" content="website">\n' +
      '<meta property="og:title" content="' + esc(title) + '">\n' +
      (desc ? '<meta property="og:description" content="' + esc(desc) + '">\n' : '') +
      (hero && hero.image ? '<meta property="og:image" content="' + esc(hero.image) + '">\n' : '') +
      '<meta name="theme-color" content="' + esc(t.accent) + '">\n' +
      '<link rel="icon" href="' + faviconData({ title: title, accent: t.accent, accent2: t.accent2 }) + '">\n' +
      '<style>\n' + SB.themeCSS(t) + '\n</style>\n' +
      '</head>\n<body id="top">\n<div class="sb-page">\n' +
      body + '\n</div>\n' +
      '<script>\n' + SB.RUNTIME_JS + '\n</script>\n' +
      '</body>\n</html>\n';
  };

  SB.NOT_FOUND_HTML = '<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"><title>404</title>' +
    '<style>body{font-family:system-ui,sans-serif;background:#0a0b10;color:#eef1f7;display:grid;' +
    'place-items:center;min-height:100vh;margin:0;text-align:center}a{color:#6366f1}</style></head>' +
    '<body><div><h1>404</h1><p>Страница не найдена.</p><p><a href="./">На главную</a></p></div></body></html>\n';
})();