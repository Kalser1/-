/* САЙТСТРОЙ — публикация в GitHub Pages через REST API.
   Токен живёт только в памяти вкладки: ни localStorage, ни отправка куда-либо,
   кроме самого api.github.com. Хостинг не нужен — репозиторий пользователя
   и бесплатные GitHub Pages. */
(function () {
  'use strict';
  var SB = (window.SB = window.SB || {});
  var API = 'https://api.github.com';

  function b64(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }

  function GHError(message, status, hint) {
    var e = new Error(message);
    e.name = 'GitHubError';
    e.status = status;
    e.hint = hint || '';
    return e;
  }

  function Gh(token) {
    this.token = token;
  }

  Gh.prototype.request = function (method, path, body) {
    var headers = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    if (this.token) headers.Authorization = 'Bearer ' + this.token;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    return fetch(API + path, {
      method: method,
      headers: headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    }).then(function (res) {
      var ct = res.headers.get('content-type') || '';
      var p = ct.indexOf('json') >= 0 ? res.json().catch(function () { return {}; }) : Promise.resolve({});
      return p.then(function (data) {
        if (!res.ok) {
          var hints = {
            401: 'Проверьте токен: он мог истечь или быть отозван.',
            403: 'Не хватает прав. Для токена нужен доступ к репозиториям и workflow.',
            404: 'Репозиторий или файл не найден.',
            409: 'Такой репозиторий или файл уже существует.',
            422: 'Проверьте имя репозитория: допустимы латиница, цифры, дефис и подчёркивание.'
          };
          throw GHError((data && data.message) || ('Ошибка GitHub ' + res.status), res.status, hints[res.status] || '');
        }
        return data;
      });
    }, function () {
      throw GHError('Нет связи с api.github.com', 0, 'Проверьте интернет — публикация требует сети.');
    });
  };

  Gh.prototype.whoami = function () {
    var self = this;
    return this.request('GET', '/user').then(function (u) {
      self.login = u.login;
      return u;
    });
  };

  /* repo: имя без пробелов. autoRename — если занято, добавием -2, -3 ... */
  Gh.prototype.createRepo = function (repo, meta) {
    var self = this;
    function attempt(name) {
      return self.request('POST', '/user/repos', {
        name: name,
        description: (meta && meta.description) || '',
        homepage: (meta && meta.homepage) || '',
        private: false,
        has_issues: false,
        has_wiki: false,
        has_projects: false,
        auto_init: false
      }).then(function (r) { return r; }, function (e) {
        if (e.status === 422 && /already exists/i.test(e.message || '')) {
          if (meta && meta.autoRename === false) throw e;
          var n = parseInt((name.match(/-(\d+)$/) || [])[1] || '1', 10) + 1;
          if (n > 60) throw e;
          return attempt(name.replace(/-\d+$/, '') + '-' + n);
        }
        throw e;
      });
    }
    return attempt(repo);
  };

  Gh.prototype.pushFiles = function (repo, files, branch, onStep) {
    var self = this;
    var base = '/repos/' + repo.owner.login + '/' + repo.name + '/contents/';
    var i = 0;

    function next() {
      if (i >= files.length) return Promise.resolve();
      var f = files[i++];
      if (onStep) onStep('Загружаю ' + f.name + ' (' + i + '/' + files.length + ')');
      var payload = {
        message: f.commit || ('Обновить ' + f.name),
        content: b64(f.content),
        branch: branch
      };
      /* файл уже существует — GitHub требует его sha */
      return self.request('GET', base + f.name).then(function (prev) {
        payload.sha = prev.sha;
        return self.request('PUT', base + f.name, payload);
      }, function () {
        return self.request('PUT', base + f.name, payload);
      }).then(function () {
        return next();
      });
    }
    return next();
  };

  Gh.prototype.enablePages = function (repo, branch) {
    var p = '/repos/' + repo.owner.login + '/' + repo.name + '/pages';
    return this.request('POST', p, { source: { branch: branch, path: '/' } })
      .then(function (r) { return r; }, function (e) {
        /* 409 = Pages уже включены, это не ошибка */
        if (e.status === 409) return null;
        throw e;
      });
  };

  Gh.prototype.pages = function (repo) {
    return this.request('GET', '/repos/' + repo.owner.login + '/' + repo.name + '/pages');
  };

  /* Полный сценарий: создать репозиторий → залить файлы → включить Pages → дождаться сборки. */
  Gh.prototype.publish = function (opts) {
    var self = this;
    var step = opts.onStep || function () {};
    var repoName, branch, created;

    return this.whoami()
      .then(function (u) {
        step('Авторизация: ' + u.login);
        return self.createRepo(opts.repo, { description: opts.description, autoRename: opts.autoRename });
      })
      .then(function (r) {
        created = r;
        repoName = r.full_name;
        branch = r.default_branch || 'main';
        step('Репозиторий создан: ' + repoName);
        return self.pushFiles(created, opts.files, branch, step);
      })
      .then(function () {
        step('Файлы загружены, включаю GitHub Pages…');
        return self.enablePages(created, branch);
      })
      .then(function () {
        var url = 'https://' + String(created.owner.login).toLowerCase() + '.github.io/' + created.name + '/';
        return self.waitForSite(created, branch, url, step);
      });
  };

  /* Actions собирает сайт обычно 20–60 секунд; ждём до 3 минут. */
  Gh.prototype.waitForSite = function (repo, branch, url, step) {
    var self = this;
    var tries = 0;

    function poll() {
      return self.pages(repo).then(function (p) {
        if (p && p.html_url) return p;
        if (p && p.status && p.status !== 'built') step('Сборка: ' + p.status);
        throw new Error('retry');
      });
    }

    function check() {
      if (++tries > 36) return Promise.resolve({ url: url, built: false });
      return poll().catch(function () {
        return new Promise(function (res) { setTimeout(res, 5000); }).then(check);
      });
    }

    return check().then(function (p) {
      return { url: (p && p.html_url) || url, built: !!(p && p.status === 'built'), branch: branch, repo: repo.full_name };
    });
  };

  /* Генератор workflow для Pages внутри экспортируемого репозитория */
  SB.PAGES_WORKFLOW = [
    'name: Публикация сайта',
    '',
    'on:',
    '  push:',
    '    branches: [main]',
    '  workflow_dispatch:',
    '',
    'permissions:',
    '  contents: read',
    '  pages: write',
    '  id-token: write',
    '',
    'concurrency:',
    '  group: pages',
    '  cancel-in-progress: true',
    '',
    'jobs:',
    '  deploy:',
    '    environment:',
    '      name: github-pages',
    '      url: ${{ steps.deployment.outputs.page_url }}',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - uses: actions/checkout@v4',
    '      - uses: actions/configure-pages@v5',
    '      - uses: actions/upload-pages-artifact@v3',
    '        with:',
    '          path: \'.\'',
    '      - name: Развернуть',
    '        id: deployment',
    '        uses: actions/deploy-pages@v4',
    ''
  ].join('\n');

  SB.Gh = Gh;
})();