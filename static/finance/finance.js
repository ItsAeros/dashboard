(function () {
    var API = '/api/finance';
    var authToken = sessionStorage.getItem('auth_token');

    // --- API helper ---

    function apiFetch(path, options) {
        options = options || {};
        options.headers = options.headers || {};
        options.headers['Authorization'] = 'Bearer ' + authToken;
        if (options.body) {
            options.headers['Content-Type'] = 'application/json';
        }
        return fetch(API + path, options).then(function (res) {
            if (res.status === 401) {
                sessionStorage.removeItem('auth_token');
                authToken = null;
                showLogin();
                return null;
            }
            return res.json();
        });
    }

    // --- Auth ---

    function showLogin() {
        document.getElementById('login-gate').classList.remove('hidden');
        document.getElementById('finance-app').classList.add('hidden');
        // Reset to step 1
        document.getElementById('login-form').classList.remove('hidden');
        document.getElementById('totp-form').classList.add('hidden');
        pendingPartialToken = null;
    }

    function showApp() {
        document.getElementById('login-gate').classList.add('hidden');
        document.getElementById('finance-app').classList.remove('hidden');
    }

    // Holds the partial token between step 1 and step 2
    var pendingPartialToken = null;

    // Step 1: username + password
    document.getElementById('login-form').addEventListener('submit', function (e) {
        e.preventDefault();
        var username = document.getElementById('login-username').value;
        var password = document.getElementById('login-password').value;
        var errorEl = document.getElementById('login-error');
        errorEl.classList.add('hidden');

        fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: username, password: password }),
        })
            .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
            .then(function (result) {
                if (!result.ok) {
                    errorEl.textContent = result.data.detail || 'Login failed';
                    errorEl.classList.remove('hidden');
                    return;
                }
                if (result.data.requires_totp) {
                    // Server says TOTP is needed — show step 2
                    pendingPartialToken = result.data.partial_token;
                    document.getElementById('login-form').classList.add('hidden');
                    document.getElementById('totp-form').classList.remove('hidden');
                    document.getElementById('login-totp').focus();
                } else {
                    // No TOTP — we got a full token
                    authToken = result.data.token;
                    sessionStorage.setItem('auth_token', authToken);
                    showApp();
                    loadDashboard();
                }
            });
    });

    // Step 2: TOTP code
    document.getElementById('totp-form').addEventListener('submit', function (e) {
        e.preventDefault();
        var totpCode = document.getElementById('login-totp').value;
        var errorEl = document.getElementById('login-error');
        errorEl.classList.add('hidden');

        fetch('/api/auth/verify-totp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ partial_token: pendingPartialToken, totp_code: totpCode }),
        })
            .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
            .then(function (result) {
                if (!result.ok) {
                    errorEl.textContent = result.data.detail || 'Invalid code';
                    errorEl.classList.remove('hidden');
                    return;
                }
                pendingPartialToken = null;
                authToken = result.data.token;
                sessionStorage.setItem('auth_token', authToken);
                showApp();
                loadDashboard();
            });
    });

    // --- Load everything ---

    function loadDashboard() {
        loadSummary();
        loadAccounts();
        loadTransactions();
    }

    // --- Net Worth & Summary ---

    function loadSummary() {
        apiFetch('/summary').then(function (data) {
            if (!data) return;

            // Net worth
            document.getElementById('net-worth-value').textContent = formatMoney(data.net_worth);

            // Monthly chart
            renderMonthlyChart(data.monthly);

            // Category chart
            renderCategoryChart(data.spending_by_category);
        });
    }

    function renderMonthlyChart(months) {
        var container = document.getElementById('monthly-chart');
        if (!months || months.length === 0) {
            container.innerHTML = '<p class="muted">No data yet.</p>';
            return;
        }

        // Find max value for scaling
        var maxVal = 0;
        months.forEach(function (m) {
            if (m.spending > maxVal) maxVal = m.spending;
            if (m.income > maxVal) maxVal = m.income;
        });
        if (maxVal === 0) maxVal = 1;

        var html = '<div class="chart-legend">';
        html += '<span><span class="legend-dot income"></span> Income</span>';
        html += '<span><span class="legend-dot spending"></span> Spending</span>';
        html += '</div>';
        html += '<div class="bar-chart">';

        // Show oldest first
        months.slice().reverse().forEach(function (m) {
            html += '<div class="bar-row">';
            html += '<div class="bar-label">' + m.month + '</div>';
            html += '<div style="flex:1;display:flex;flex-direction:column;gap:2px">';
            html += '<div class="bar-track"><div class="bar-fill income" style="width:' + ((m.income / maxVal) * 100) + '%"></div></div>';
            html += '<div class="bar-track"><div class="bar-fill spending" style="width:' + ((m.spending / maxVal) * 100) + '%"></div></div>';
            html += '</div>';
            html += '<div class="bar-amount">' + formatMoney(m.income) + '<br>' + formatMoney(m.spending) + '</div>';
            html += '</div>';
        });

        html += '</div>';
        container.innerHTML = html;
    }

    function renderCategoryChart(categories) {
        var container = document.getElementById('category-chart');
        if (!categories || categories.length === 0) {
            container.innerHTML = '<p class="muted">No spending data yet.</p>';
            return;
        }

        var maxVal = categories[0].total || 1;
        var html = '<div class="bar-chart">';

        categories.forEach(function (cat) {
            var label = cat.category || 'Uncategorized';
            html += '<div class="bar-row">';
            html += '<div class="bar-label">' + escapeHtml(label) + '</div>';
            html += '<div class="bar-track"><div class="bar-fill category" style="width:' + ((cat.total / maxVal) * 100) + '%"></div></div>';
            html += '<div class="bar-amount">' + formatMoney(cat.total) + '</div>';
            html += '</div>';
        });

        html += '</div>';
        container.innerHTML = html;
    }

    // --- Accounts ---

    function loadAccounts() {
        apiFetch('/accounts').then(function (accounts) {
            if (!accounts) return;

            var grid = document.getElementById('accounts-grid');
            var noMsg = document.getElementById('no-accounts');

            if (accounts.length === 0) {
                grid.innerHTML = '';
                noMsg.classList.remove('hidden');
                return;
            }

            noMsg.classList.add('hidden');
            grid.innerHTML = '';

            accounts.forEach(function (acct) {
                var card = document.createElement('div');
                card.className = 'account-card';
                card.innerHTML =
                    '<div class="account-name">' + escapeHtml(acct.name) +
                        (acct.mask ? ' ••' + acct.mask : '') + '</div>' +
                    '<div class="account-institution">' + escapeHtml(acct.institution_name || '') + '</div>' +
                    '<div class="account-balance">' + formatMoney(acct.current_balance) + '</div>' +
                    '<div class="account-type">' + escapeHtml(acct.type) +
                        (acct.subtype ? ' / ' + acct.subtype : '') + '</div>' +
                    '<div class="account-actions">' +
                        '<button class="btn-unlink" data-item="' + escapeHtml(acct.plaid_item_id) + '">Unlink</button>' +
                    '</div>';
                grid.appendChild(card);
            });

            // Unlink buttons
            grid.querySelectorAll('.btn-unlink').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    if (!confirm('Unlink this institution and remove all its data?')) return;
                    var itemId = this.getAttribute('data-item');
                    apiFetch('/accounts/' + itemId, { method: 'DELETE' }).then(function () {
                        loadDashboard();
                    });
                });
            });
        });
    }

    // --- Transactions ---

    function loadTransactions(startDate, endDate) {
        var params = [];
        if (startDate) params.push('start_date=' + startDate);
        if (endDate) params.push('end_date=' + endDate);
        var query = params.length ? '?' + params.join('&') : '';

        apiFetch('/transactions' + query).then(function (transactions) {
            if (!transactions) return;

            var tbody = document.getElementById('transactions-body');
            var noMsg = document.getElementById('no-transactions');

            if (transactions.length === 0) {
                tbody.innerHTML = '';
                noMsg.classList.remove('hidden');
                return;
            }

            noMsg.classList.add('hidden');
            tbody.innerHTML = '';

            transactions.forEach(function (txn) {
                var tr = document.createElement('tr');
                var amountClass = txn.amount > 0 ? 'amount-positive' : 'amount-negative';
                tr.innerHTML =
                    '<td>' + escapeHtml(txn.date) + '</td>' +
                    '<td>' + escapeHtml(txn.merchant_name || txn.name) + '</td>' +
                    '<td>' + escapeHtml(txn.category || '') + '</td>' +
                    '<td class="amount-col ' + amountClass + '">' + formatMoney(Math.abs(txn.amount)) + '</td>';
                tbody.appendChild(tr);
            });
        });
    }

    // --- Filter button ---
    document.getElementById('btn-filter').addEventListener('click', function () {
        var start = document.getElementById('filter-start').value;
        var end = document.getElementById('filter-end').value;
        loadTransactions(start || null, end || null);
    });

    // --- Sync button ---
    document.getElementById('btn-sync').addEventListener('click', function () {
        var btn = this;
        btn.disabled = true;
        btn.textContent = 'Syncing...';
        apiFetch('/sync', { method: 'POST' }).then(function () {
            btn.disabled = false;
            btn.textContent = 'Sync All';
            loadDashboard();
        });
    });

    // --- Connect Bank (Plaid Link) ---
    document.getElementById('btn-connect').addEventListener('click', function () {
        apiFetch('/link-token', { method: 'POST' }).then(function (data) {
            if (!data || !data.link_token) return;

            var handler = Plaid.create({
                token: data.link_token,
                onSuccess: function (publicToken, metadata) {
                    var institutionName = metadata.institution ? metadata.institution.name : '';
                    apiFetch('/exchange-token', {
                        method: 'POST',
                        body: JSON.stringify({
                            public_token: publicToken,
                            institution_name: institutionName,
                        }),
                    }).then(function () {
                        // Sync transactions after linking
                        return apiFetch('/sync', { method: 'POST' });
                    }).then(function () {
                        loadDashboard();
                    });
                },
                onExit: function () {
                    // User closed Plaid Link, nothing to do
                },
            });
            handler.open();
        });
    });

    // --- Helpers ---

    function formatMoney(amount) {
        if (amount == null) return '--';
        return '$' + Number(amount).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    }

    function escapeHtml(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // --- Init ---

    if (authToken) {
        showApp();
        loadDashboard();
    } else {
        showLogin();
    }
})();
