(function () {
    const CONFIG_URL = 'services.json';
    const STATS_URL = 'stats.json';
    const STATUS_CHECK_INTERVAL = 60000;
    const CLOCK_INTERVAL = 1000;

    let allServices = [];

    // --- Init ---

    async function init() {
        renderClock();
        setInterval(updateClock, CLOCK_INTERVAL);

        try {
            const config = await loadConfig();
            allServices = config.categories.flatMap(c =>
                c.services.map(s => ({ ...s, category: c.name }))
            );
            renderBraveSearch();
            renderSearchBar();
            renderServices(config.categories);
            renderLinks(config.links || []);
            checkAllStatuses();
            setInterval(checkAllStatuses, STATUS_CHECK_INTERVAL);
        } catch (e) {
            document.getElementById('services').innerHTML =
                '<p style="text-align:center;color:#888;">Failed to load services.</p>';
        }

        loadStats();
        setInterval(loadStats, STATUS_CHECK_INTERVAL);
        setupKeyboardNav();
    }

    // --- Config ---

    async function loadConfig() {
        const res = await fetch(CONFIG_URL);
        return res.json();
    }

    // --- Clock / Greeting ---

    function getGreeting(hour) {
        if (hour < 12) return 'Good morning';
        if (hour < 18) return 'Good afternoon';
        return 'Good evening';
    }

    function renderClock() {
        const header = document.getElementById('header');
        const now = new Date();
        const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const date = now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const greeting = getGreeting(now.getHours());

        header.innerHTML =
            '<div class="clock">' +
                '<div class="greeting">' + greeting + '</div>' +
                '<div class="time">' + time + '</div>' +
                '<div class="date">' + date + '</div>' +
            '</div>';
    }

    function updateClock() {
        const timeEl = document.querySelector('.clock .time');
        const greetingEl = document.querySelector('.clock .greeting');
        if (!timeEl) return;

        const now = new Date();
        timeEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        greetingEl.textContent = getGreeting(now.getHours());
    }

    // --- Brave Search ---

    function renderBraveSearch() {
        var wrapper = document.getElementById('brave-search-wrapper');
        var form = document.createElement('form');
        form.id = 'brave-search';
        form.action = 'https://search.brave.com/search';
        form.method = 'GET';
        form.target = '_blank';

        var input = document.createElement('input');
        input.type = 'text';
        input.name = 'q';
        input.placeholder = 'Search with Brave...';
        input.autocomplete = 'off';

        form.appendChild(input);
        wrapper.appendChild(form);
    }

    // --- Service Filter ---

    function renderSearchBar() {
        const wrapper = document.getElementById('search-wrapper');
        const input = document.createElement('input');
        input.type = 'text';
        input.id = 'search';
        input.placeholder = 'Filter services...';
        input.autocomplete = 'off';
        input.addEventListener('input', function () {
            filterServices(this.value);
        });
        wrapper.appendChild(input);
    }

    function filterServices(query) {
        const q = query.toLowerCase();
        const cards = document.querySelectorAll('.card');
        cards.forEach(function (card) {
            var name = card.getAttribute('data-name');
            card.classList.toggle('hidden', name.indexOf(q) === -1);
        });

        document.querySelectorAll('.category').forEach(function (section) {
            var visibleCards = section.querySelectorAll('.card:not(.hidden)');
            section.classList.toggle('hidden', visibleCards.length === 0);
        });
    }

    // --- Render Services ---

    function renderServices(categories) {
        var container = document.getElementById('services');
        container.innerHTML = '';

        categories.forEach(function (cat) {
            var section = document.createElement('section');
            section.className = 'category';
            section.setAttribute('data-category', cat.name);

            var heading = document.createElement('h2');
            heading.textContent = cat.name;
            section.appendChild(heading);

            var grid = document.createElement('div');
            grid.className = 'grid';

            cat.services.forEach(function (service) {
                grid.appendChild(renderCard(service));
            });

            section.appendChild(grid);
            container.appendChild(section);
        });
    }

    function renderCard(service) {
        var a = document.createElement('a');
        a.href = service.url;
        a.className = 'card';
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.setAttribute('data-name', service.name.toLowerCase());
        if (service.shortcut) {
            a.setAttribute('data-shortcut', service.shortcut);
        }

        var dot = document.createElement('span');
        dot.className = 'status-dot';
        a.appendChild(dot);

        var icon = document.createElement('div');
        icon.className = 'icon';
        icon.textContent = service.icon;
        a.appendChild(icon);

        var title = document.createElement('div');
        title.className = 'title';
        title.textContent = service.name;
        a.appendChild(title);

        if (service.shortcut) {
            var hint = document.createElement('span');
            hint.className = 'shortcut-hint';
            hint.textContent = service.shortcut;
            a.appendChild(hint);
        }

        return a;
    }

    // --- Render Links ---

    function renderLinks(linkGroups) {
        var container = document.getElementById('links');
        if (!linkGroups.length) return;

        container.innerHTML = '';
        var section = document.createElement('div');
        section.className = 'links-section';

        linkGroups.forEach(function (group) {
            var category = document.createElement('div');
            category.className = 'links-category';

            var label = document.createElement('span');
            label.className = 'links-label';
            label.textContent = group.name;
            category.appendChild(label);

            group.items.forEach(function (link) {
                var a = document.createElement('a');
                a.href = link.url;
                a.className = 'link-item';
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                a.textContent = link.name;
                category.appendChild(a);
            });

            section.appendChild(category);
        });

        container.appendChild(section);
    }

    // --- Status Checks ---

    function checkAllStatuses() {
        var cards = document.querySelectorAll('.card');
        cards.forEach(function (card) {
            var dot = card.querySelector('.status-dot');
            var url = card.href;
            checkStatus(url, dot);
        });
    }

    async function checkStatus(url, dotElement) {
        try {
            await fetch(url, {
                method: 'HEAD',
                mode: 'no-cors',
                cache: 'no-store'
            });
            dotElement.classList.add('status-up');
            dotElement.classList.remove('status-down');
        } catch (e) {
            dotElement.classList.add('status-down');
            dotElement.classList.remove('status-up');
        }
    }

    // --- System Stats ---

    async function loadStats() {
        var widget = document.getElementById('stats-widget');
        try {
            var res = await fetch(STATS_URL, { cache: 'no-store' });
            if (!res.ok) throw new Error();
            var data = await res.json();
            renderStats(data);
        } catch (e) {
            widget.innerHTML = '';
        }
    }

    function renderStats(data) {
        var widget = document.getElementById('stats-widget');
        widget.innerHTML = '';

        var items = [
            { label: 'Uptime', value: data.uptime, percent: null },
            { label: 'CPU', value: data.cpu + '%', percent: data.cpu },
            { label: 'RAM', value: data.memory.used + ' / ' + data.memory.total + ' MB', percent: data.memory.percent },
            { label: 'Disk', value: data.disk.used + ' / ' + data.disk.total + ' GB', percent: data.disk.percent }
        ];

        items.forEach(function (item) {
            var el = document.createElement('div');
            el.className = 'stat-item';

            var label = document.createElement('div');
            label.className = 'stat-label';
            label.textContent = item.label;
            el.appendChild(label);

            var value = document.createElement('div');
            value.className = 'stat-value';
            value.textContent = item.value;
            el.appendChild(value);

            if (item.percent !== null) {
                var bar = document.createElement('div');
                bar.className = 'stat-bar';
                var fill = document.createElement('div');
                fill.className = 'stat-bar-fill';
                fill.style.width = Math.min(item.percent, 100) + '%';
                if (item.percent > 90) {
                    fill.style.background = '#f44336';
                } else if (item.percent > 70) {
                    fill.style.background = '#ff9800';
                }
                bar.appendChild(fill);
                el.appendChild(bar);
            }

            widget.appendChild(el);
        });
    }

    // --- Keyboard Navigation ---

    function setupKeyboardNav() {
        document.addEventListener('keydown', function (e) {
            var searchInput = document.getElementById('search');
            var braveInput = document.querySelector('#brave-search input');
            var isTyping = document.activeElement === searchInput ||
                           document.activeElement === braveInput;

            // "/" focuses search
            if (e.key === '/' && !isTyping) {
                e.preventDefault();
                searchInput.focus();
                return;
            }

            // Escape clears search and blurs
            if (e.key === 'Escape') {
                searchInput.value = '';
                filterServices('');
                searchInput.blur();
                if (braveInput) braveInput.blur();
                return;
            }

            // Number keys open shortcuts (only when not typing in search)
            if (!isTyping && e.key >= '1' && e.key <= '9') {
                var card = document.querySelector('.card[data-shortcut="' + e.key + '"]:not(.hidden)');
                if (card) {
                    window.open(card.href, '_blank', 'noopener,noreferrer');
                }
                return;
            }

            // Arrow key navigation between cards
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' ||
                e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                var cards = Array.from(document.querySelectorAll('.card:not(.hidden)'));
                if (cards.length === 0) return;

                var current = cards.indexOf(document.activeElement);
                var next;

                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                    next = current < cards.length - 1 ? current + 1 : 0;
                } else {
                    next = current > 0 ? current - 1 : cards.length - 1;
                }

                e.preventDefault();
                cards[next].focus();
            }
        });
    }

    document.addEventListener('DOMContentLoaded', init);
})();
