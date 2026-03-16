(function () {
    const SERVICES_URL = '/api/services';
    const STATUS_URL = '/api/services/status';
    const STATS_URL = '/api/stats';
    const BOOKMARKS_URL = '/api/bookmarks';
    const STATUS_CHECK_INTERVAL = 60000;
    const CLOCK_INTERVAL = 1000;

    let allServices = [];
    let serviceData = []; // current service categories from API
    let editMode = false;
    let bookmarkData = []; // current bookmark groups from API

    // --- Init ---

    async function init() {
        renderClock();
        setInterval(updateClock, CLOCK_INTERVAL);

        renderSearchBar();

        await loadAndRenderServices();
        checkAllStatuses();
        setInterval(checkAllStatuses, STATUS_CHECK_INTERVAL);

        await loadAndRenderBookmarks();

        loadStats();
        setInterval(loadStats, STATUS_CHECK_INTERVAL);
        setupKeyboardNav();
        setupLoginModal();
    }

    // --- Services from API ---

    async function loadAndRenderServices() {
        try {
            var res = await fetch(SERVICES_URL);
            serviceData = await res.json();
        } catch (e) {
            serviceData = [];
        }
        // Build flat list for keyboard nav
        allServices = serviceData.flatMap(function (cat) {
            return cat.services.map(function (s) {
                return Object.assign({}, s, { category: cat.name });
            });
        });
        renderServices(serviceData);
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

            if (editMode) {
                // Editable category header with rename/delete
                var headRow = document.createElement('div');
                headRow.className = 'svc-heading-row';

                var heading = document.createElement('h2');
                heading.textContent = cat.name;
                headRow.appendChild(heading);

                var renameBtn = document.createElement('button');
                renameBtn.className = 'bm-icon-btn';
                renameBtn.title = 'Rename category';
                renameBtn.textContent = 'Rename';
                renameBtn.addEventListener('click', function () {
                    startRenameSvcCategory(section, cat.name);
                });
                headRow.appendChild(renameBtn);

                var delCatBtn = document.createElement('button');
                delCatBtn.className = 'bm-icon-btn danger';
                delCatBtn.title = 'Delete category';
                delCatBtn.textContent = 'Del';
                delCatBtn.addEventListener('click', function () {
                    if (confirm('Delete category "' + cat.name + '" and all its services?')) {
                        deleteSvcCategory(cat.name);
                    }
                });
                headRow.appendChild(delCatBtn);

                // Make heading row the drag handle for category reordering
                headRow.draggable = true;
                headRow.style.cursor = 'grab';
                headRow.addEventListener('dragstart', function (e) {
                    e.dataTransfer.setData('text/plain', 'category:' + cat.name);
                    e.dataTransfer.effectAllowed = 'move';
                    section.classList.add('dragging-group');
                });
                headRow.addEventListener('dragend', function () {
                    section.classList.remove('dragging-group');
                });

                section.appendChild(headRow);
            } else {
                var heading = document.createElement('h2');
                heading.textContent = cat.name;
                section.appendChild(heading);
            }

            var grid = document.createElement('div');
            grid.className = 'grid';

            cat.services.forEach(function (service) {
                if (editMode) {
                    grid.appendChild(renderEditableCard(service, cat.name));
                } else {
                    grid.appendChild(renderCard(service));
                }
            });

            // "+ Add Service" button in edit mode
            if (editMode) {
                var addBtn = document.createElement('button');
                addBtn.className = 'svc-add-btn';
                addBtn.textContent = '+ Add Service';
                addBtn.addEventListener('click', function () {
                    startAddService(section, cat.name);
                });
                grid.appendChild(addBtn);
            }

            section.appendChild(grid);
            container.appendChild(section);
        });

        // Drag-and-drop reorder (cards across all grids) + category reorder
        if (editMode) {
            setupServiceDragDrop(container);
            setupCategoryDragDrop(container);

            var addCatBtn = document.createElement('button');
            addCatBtn.className = 'svc-add-cat-btn';
            addCatBtn.textContent = '+ Add Category';
            addCatBtn.addEventListener('click', function () {
                startAddSvcCategory(container);
            });
            container.appendChild(addCatBtn);
        }
    }

    function isIconUrl(icon) {
        return icon && (icon.startsWith('/') || icon.startsWith('http://') || icon.startsWith('https://'));
    }

    function createIconElement(iconValue) {
        var icon = document.createElement('div');
        icon.className = 'icon';
        if (isIconUrl(iconValue)) {
            var img = document.createElement('img');
            img.src = iconValue;
            img.alt = '';
            img.loading = 'lazy';
            icon.appendChild(img);
        } else {
            icon.textContent = iconValue;
        }
        return icon;
    }

    function renderCard(service) {
        var a = document.createElement('a');
        a.href = service.url;
        a.className = 'card';

        a.setAttribute('data-id', service.id);
        a.setAttribute('data-name', service.name.toLowerCase());
        if (service.shortcut) {
            a.setAttribute('data-shortcut', service.shortcut);
        }

        var dot = document.createElement('span');
        dot.className = 'status-dot';
        a.appendChild(dot);

        a.appendChild(createIconElement(service.icon));

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

    function renderEditableCard(service, categoryName) {
        var wrapper = document.createElement('div');
        wrapper.className = 'card card-editable';
        wrapper.setAttribute('data-id', service.id);
        wrapper.setAttribute('data-name', service.name.toLowerCase());
        if (service.shortcut) {
            wrapper.setAttribute('data-shortcut', service.shortcut);
        }

        var handle = document.createElement('div');
        handle.className = 'card-drag-handle';
        wrapper.appendChild(handle);

        wrapper.appendChild(createIconElement(service.icon));

        var title = document.createElement('div');
        title.className = 'title';
        title.textContent = service.name;
        wrapper.appendChild(title);

        if (service.shortcut) {
            var hint = document.createElement('span');
            hint.className = 'shortcut-hint';
            hint.textContent = service.shortcut;
            wrapper.appendChild(hint);
        }

        // Edit/delete overlay
        var overlay = document.createElement('div');
        overlay.className = 'card-edit-overlay';

        var editBtn = document.createElement('button');
        editBtn.className = 'bm-btn bm-btn-primary';
        editBtn.textContent = 'Edit';
        editBtn.addEventListener('click', function () {
            startEditService(wrapper.closest('.category'), service);
        });
        overlay.appendChild(editBtn);

        var delBtn = document.createElement('button');
        delBtn.className = 'bm-btn bm-btn-danger';
        delBtn.textContent = 'Delete';
        delBtn.addEventListener('click', function () {
            if (confirm('Delete "' + service.name + '"?')) {
                deleteSvcItem(service.id);
            }
        });
        overlay.appendChild(delBtn);

        wrapper.appendChild(overlay);
        return wrapper;
    }

    // --- Service CRUD helpers ---

    function buildIconInput(currentValue) {
        var hasImage = isIconUrl(currentValue);
        var iconValue = currentValue;

        var row = document.createElement('div');
        row.className = 'svc-icon-row';

        // Emoji input
        var emojiInput = document.createElement('input');
        emojiInput.type = 'text';
        emojiInput.placeholder = 'Emoji';
        emojiInput.className = 'svc-icon-input';
        emojiInput.value = hasImage ? '' : currentValue;

        // "or" label
        var orLabel = document.createElement('span');
        orLabel.className = 'svc-icon-or';
        orLabel.textContent = 'or';

        // Drop zone / file area
        var dropZone = document.createElement('label');
        dropZone.className = 'svc-icon-dropzone';

        var fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.style.display = 'none';

        var dropLabel = document.createElement('span');
        dropLabel.className = 'svc-icon-dropzone-label';
        dropLabel.textContent = 'Drop image or click';

        var preview = document.createElement('img');
        preview.className = 'svc-icon-preview';
        if (hasImage) {
            preview.src = currentValue;
            preview.style.display = 'block';
            dropLabel.style.display = 'none';
        } else {
            preview.style.display = 'none';
        }

        // Clear button (visible when an image is set)
        var clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'svc-icon-clear';
        clearBtn.textContent = '\u00d7';
        clearBtn.title = 'Remove image';
        clearBtn.style.display = hasImage ? '' : 'none';

        dropZone.appendChild(fileInput);
        dropZone.appendChild(dropLabel);
        dropZone.appendChild(preview);

        function uploadFile(file) {
            if (!file || !file.type.startsWith('image/')) return;
            dropLabel.textContent = 'Uploading\u2026';
            var formData = new FormData();
            formData.append('file', file);
            bmFetch('/api/services/icons', { method: 'POST', body: formData })
                .then(function (res) {
                    if (!res.ok) throw new Error('Upload failed');
                    return res.json();
                })
                .then(function (data) {
                    iconValue = data.path;
                    preview.src = data.path;
                    preview.style.display = 'block';
                    dropLabel.style.display = 'none';
                    clearBtn.style.display = '';
                    emojiInput.value = '';
                })
                .catch(function () {
                    dropLabel.textContent = 'Upload failed';
                    dropLabel.style.display = '';
                });
        }

        // Typing emoji clears image
        emojiInput.addEventListener('input', function () {
            iconValue = emojiInput.value;
            if (emojiInput.value) {
                preview.style.display = 'none';
                dropLabel.style.display = '';
                dropLabel.textContent = 'Drop image or click';
                clearBtn.style.display = 'none';
                fileInput.value = '';
            }
        });

        fileInput.addEventListener('change', function () {
            if (fileInput.files[0]) uploadFile(fileInput.files[0]);
        });

        // Drag-and-drop on the drop zone
        dropZone.addEventListener('dragover', function (e) {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });
        dropZone.addEventListener('dragleave', function () {
            dropZone.classList.remove('dragover');
        });
        dropZone.addEventListener('drop', function (e) {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            if (e.dataTransfer.files[0]) uploadFile(e.dataTransfer.files[0]);
        });

        // Clear button resets to empty
        clearBtn.addEventListener('click', function (e) {
            e.preventDefault();
            iconValue = '';
            preview.style.display = 'none';
            dropLabel.style.display = '';
            dropLabel.textContent = 'Drop image or click';
            clearBtn.style.display = 'none';
            fileInput.value = '';
        });

        row.appendChild(emojiInput);
        row.appendChild(orLabel);
        row.appendChild(dropZone);
        row.appendChild(clearBtn);

        return {
            el: row,
            getValue: function () { return iconValue; }
        };
    }

    function startAddService(sectionEl, categoryName) {
        removeInlineForms();

        var form = document.createElement('div');
        form.className = 'bm-inline-form svc-inline-form';

        var nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.placeholder = 'Name';

        var urlInput = document.createElement('input');
        urlInput.type = 'text';
        urlInput.placeholder = 'URL';

        var iconRow = buildIconInput('');

        var shortcutInput = document.createElement('input');
        shortcutInput.type = 'number';
        shortcutInput.placeholder = 'Shortcut #';
        shortcutInput.min = '1';
        shortcutInput.max = '9';
        shortcutInput.className = 'svc-shortcut-input';

        var actions = document.createElement('div');
        actions.className = 'bm-form-actions';

        var saveBtn = document.createElement('button');
        saveBtn.className = 'bm-btn bm-btn-primary';
        saveBtn.textContent = 'Save';
        saveBtn.addEventListener('click', function () {
            if (nameInput.value && urlInput.value) {
                createSvcItem(categoryName, nameInput.value, urlInput.value, iconRow.getValue(), shortcutInput.value);
            }
        });

        var cancelBtn = document.createElement('button');
        cancelBtn.className = 'bm-btn bm-btn-secondary';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', function () {
            form.remove();
        });

        actions.appendChild(cancelBtn);
        actions.appendChild(saveBtn);
        form.appendChild(nameInput);
        form.appendChild(urlInput);
        form.appendChild(iconRow.el);
        form.appendChild(shortcutInput);
        form.appendChild(actions);
        sectionEl.appendChild(form);
        nameInput.focus();
    }

    function startEditService(sectionEl, service) {
        removeInlineForms();

        var form = document.createElement('div');
        form.className = 'bm-inline-form svc-inline-form';

        var nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.placeholder = 'Name';
        nameInput.value = service.name;

        var urlInput = document.createElement('input');
        urlInput.type = 'text';
        urlInput.placeholder = 'URL';
        urlInput.value = service.url;

        var iconRow = buildIconInput(service.icon || '');

        var shortcutInput = document.createElement('input');
        shortcutInput.type = 'number';
        shortcutInput.placeholder = 'Shortcut #';
        shortcutInput.min = '1';
        shortcutInput.max = '9';
        shortcutInput.value = service.shortcut || '';
        shortcutInput.className = 'svc-shortcut-input';

        var actions = document.createElement('div');
        actions.className = 'bm-form-actions';

        var saveBtn = document.createElement('button');
        saveBtn.className = 'bm-btn bm-btn-primary';
        saveBtn.textContent = 'Save';
        saveBtn.addEventListener('click', function () {
            if (nameInput.value && urlInput.value) {
                updateSvcItem(service.id, nameInput.value, urlInput.value, iconRow.getValue(), shortcutInput.value);
            }
        });

        var cancelBtn = document.createElement('button');
        cancelBtn.className = 'bm-btn bm-btn-secondary';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', function () {
            form.remove();
        });

        actions.appendChild(cancelBtn);
        actions.appendChild(saveBtn);
        form.appendChild(nameInput);
        form.appendChild(urlInput);
        form.appendChild(iconRow.el);
        form.appendChild(shortcutInput);
        form.appendChild(actions);
        sectionEl.appendChild(form);
        nameInput.focus();
        nameInput.select();
    }

    function startRenameSvcCategory(sectionEl, oldName) {
        removeInlineForms();

        var form = document.createElement('div');
        form.className = 'bm-inline-form svc-inline-form';

        var nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.placeholder = 'Category name';
        nameInput.value = oldName;

        var actions = document.createElement('div');
        actions.className = 'bm-form-actions';

        var saveBtn = document.createElement('button');
        saveBtn.className = 'bm-btn bm-btn-primary';
        saveBtn.textContent = 'Save';
        saveBtn.addEventListener('click', function () {
            if (nameInput.value && nameInput.value !== oldName) {
                renameSvcCategory(oldName, nameInput.value);
            } else {
                form.remove();
            }
        });

        var cancelBtn = document.createElement('button');
        cancelBtn.className = 'bm-btn bm-btn-secondary';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', function () {
            form.remove();
        });

        actions.appendChild(cancelBtn);
        actions.appendChild(saveBtn);
        form.appendChild(nameInput);
        form.appendChild(actions);
        // Insert after the heading row
        var grid = sectionEl.querySelector('.grid');
        sectionEl.insertBefore(form, grid);
        nameInput.focus();
        nameInput.select();
    }

    function startAddSvcCategory(containerEl) {
        removeInlineForms();

        var form = document.createElement('div');
        form.className = 'bm-inline-form svc-inline-form';

        var nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.placeholder = 'New category name';

        var actions = document.createElement('div');
        actions.className = 'bm-form-actions';

        var saveBtn = document.createElement('button');
        saveBtn.className = 'bm-btn bm-btn-primary';
        saveBtn.textContent = 'Create';
        saveBtn.addEventListener('click', function () {
            if (nameInput.value) {
                createSvcCategory(nameInput.value);
            }
        });

        var cancelBtn = document.createElement('button');
        cancelBtn.className = 'bm-btn bm-btn-secondary';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', function () {
            form.remove();
        });

        actions.appendChild(cancelBtn);
        actions.appendChild(saveBtn);
        form.appendChild(nameInput);
        form.appendChild(actions);
        // Insert before the "Add Category" button
        var addCatBtn = containerEl.querySelector('.svc-add-cat-btn');
        containerEl.insertBefore(form, addCatBtn);
        nameInput.focus();
    }

    // --- Service API calls ---

    async function createSvcItem(category, name, url, icon, shortcut) {
        var body = { category: category, name: name, url: url, icon: icon || '' };
        if (shortcut) body.shortcut = parseInt(shortcut, 10);
        var res = await bmFetch(SERVICES_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (res.ok) await loadAndRenderServices();
    }

    async function updateSvcItem(id, name, url, icon, shortcut) {
        var body = { name: name, url: url, icon: icon || '' };
        if (shortcut) body.shortcut = parseInt(shortcut, 10);
        var res = await bmFetch(SERVICES_URL + '/' + id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (res.ok) await loadAndRenderServices();
    }

    async function deleteSvcItem(id) {
        var res = await bmFetch(SERVICES_URL + '/' + id, { method: 'DELETE' });
        if (res.ok) await loadAndRenderServices();
    }

    async function createSvcCategory(name) {
        var res = await bmFetch(SERVICES_URL + '/categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name }),
        });
        if (res.ok) {
            // Add empty category locally so it renders immediately
            serviceData.push({ name: name, services: [] });
            renderServices(serviceData);
        }
    }

    async function renameSvcCategory(oldName, newName) {
        var res = await bmFetch(SERVICES_URL + '/categories/' + encodeURIComponent(oldName), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ new_name: newName }),
        });
        if (res.ok) await loadAndRenderServices();
    }

    async function deleteSvcCategory(name) {
        var res = await bmFetch(SERVICES_URL + '/categories/' + encodeURIComponent(name), {
            method: 'DELETE',
        });
        if (res.ok) await loadAndRenderServices();
    }

    // --- Bookmarks (sidebar from API) ---

    function getAuthToken() {
        return sessionStorage.getItem('authToken');
    }

    function setAuthToken(token) {
        sessionStorage.setItem('authToken', token);
    }

    function clearAuthToken() {
        sessionStorage.removeItem('authToken');
    }

    async function bmFetch(url, options) {
        options = options || {};
        var token = getAuthToken();
        if (token) {
            options.headers = options.headers || {};
            options.headers['Authorization'] = 'Bearer ' + token;
        }
        var res = await fetch(url, options);
        if (res.status === 401) {
            clearAuthToken();
            editMode = false;
        }
        return res;
    }

    async function loadAndRenderBookmarks() {
        try {
            var res = await fetch(BOOKMARKS_URL);
            bookmarkData = await res.json();
        } catch (e) {
            bookmarkData = [];
        }
        renderSidebar(bookmarkData);
    }

    // Re-render both services and bookmarks (used when toggling edit mode)
    function refreshEditMode() {
        renderServices(serviceData);
        renderSidebar(bookmarkData);
    }

    function renderSidebar(linkGroups) {
        var sidebar = document.getElementById('sidebar');
        sidebar.innerHTML = '';

        // Edit toggle button
        var toggleBtn = document.createElement('button');
        toggleBtn.className = 'sidebar-edit-toggle' + (editMode ? ' active' : '');
        toggleBtn.textContent = editMode ? 'Done' : 'Edit';
        toggleBtn.addEventListener('click', function () {
            if (!editMode) {
                if (getAuthToken()) {
                    editMode = true;
                    refreshEditMode();
                } else {
                    showLoginModal();
                }
            } else {
                editMode = false;
                refreshEditMode();
            }
        });
        sidebar.appendChild(toggleBtn);

        linkGroups.forEach(function (group) {
            var card = document.createElement('div');
            card.className = 'sidebar-card';
            card.setAttribute('data-group', group.name);

            if (editMode) {
                // Make sidebar card draggable for group reordering
                card.draggable = true;
                card.addEventListener('dragstart', function (e) {
                    if (e.target !== card) return;
                    e.dataTransfer.setData('text/plain', 'bmgroup:' + group.name);
                    e.dataTransfer.effectAllowed = 'move';
                    card.classList.add('dragging-group');
                });
                card.addEventListener('dragend', function () {
                    card.classList.remove('dragging-group');
                });

                // Editable group header with rename/delete
                var headRow = document.createElement('div');
                headRow.className = 'sidebar-heading-row';

                var heading = document.createElement('h3');
                heading.textContent = group.name;
                headRow.appendChild(heading);

                var renameBtn = document.createElement('button');
                renameBtn.className = 'bm-icon-btn';
                renameBtn.title = 'Rename group';
                renameBtn.textContent = 'Rename';
                renameBtn.addEventListener('click', function () {
                    startRenameGroup(card, group.name);
                });
                headRow.appendChild(renameBtn);

                var delGrpBtn = document.createElement('button');
                delGrpBtn.className = 'bm-icon-btn danger';
                delGrpBtn.title = 'Delete group';
                delGrpBtn.textContent = 'Del';
                delGrpBtn.addEventListener('click', function () {
                    if (confirm('Delete group "' + group.name + '" and all its bookmarks?')) {
                        deleteGroup(group.name);
                    }
                });
                headRow.appendChild(delGrpBtn);

                card.appendChild(headRow);
            } else {
                var heading = document.createElement('h3');
                heading.className = 'sidebar-heading';
                heading.textContent = group.name;
                card.appendChild(heading);
            }

            var list = document.createElement('div');
            list.className = 'sidebar-links';

            group.items.forEach(function (link) {
                if (editMode) {
                    var row = document.createElement('div');
                    row.className = 'sidebar-link-row';

                    var a = document.createElement('a');
                    a.href = link.url;
                    a.className = 'sidebar-link';
                    a.textContent = link.name;
                    row.appendChild(a);

                    var actions = document.createElement('div');
                    actions.className = 'bm-link-actions';

                    var editBtn = document.createElement('button');
                    editBtn.className = 'bm-icon-btn';
                    editBtn.title = 'Edit';
                    editBtn.textContent = 'Edit';
                    editBtn.addEventListener('click', function () {
                        startEditBookmark(list, link);
                    });
                    actions.appendChild(editBtn);

                    var delBtn = document.createElement('button');
                    delBtn.className = 'bm-icon-btn danger';
                    delBtn.title = 'Delete';
                    delBtn.textContent = 'Del';
                    delBtn.addEventListener('click', function () {
                        if (confirm('Delete "' + link.name + '"?')) {
                            deleteBookmark(link.id);
                        }
                    });
                    actions.appendChild(delBtn);

                    row.appendChild(actions);
                    list.appendChild(row);
                } else {
                    var a = document.createElement('a');
                    a.href = link.url;
                    a.className = 'sidebar-link';
                    a.textContent = link.name;
                    list.appendChild(a);
                }
            });

            card.appendChild(list);

            // "+" button to add a bookmark to this group
            if (editMode) {
                var addBtn = document.createElement('button');
                addBtn.className = 'bm-add-btn';
                addBtn.textContent = '+ Add Link';
                addBtn.addEventListener('click', function () {
                    startAddBookmark(card, group.name);
                });
                card.appendChild(addBtn);
            }

            sidebar.appendChild(card);
        });

        // Sidebar group reorder + "Add Group" button in edit mode
        if (editMode) {
            setupSidebarGroupDragDrop(sidebar);

            var addGrpBtn = document.createElement('button');
            addGrpBtn.className = 'bm-add-group-btn';
            addGrpBtn.textContent = '+ Add Group';
            addGrpBtn.addEventListener('click', function () {
                startAddGroup(sidebar);
            });
            sidebar.appendChild(addGrpBtn);
        }
    }

    // --- Bookmark CRUD helpers ---

    function startAddBookmark(cardEl, groupName) {
        removeInlineForms();

        var form = document.createElement('div');
        form.className = 'bm-inline-form';

        var nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.placeholder = 'Name';

        var urlInput = document.createElement('input');
        urlInput.type = 'text';
        urlInput.placeholder = 'URL';

        var actions = document.createElement('div');
        actions.className = 'bm-form-actions';

        var saveBtn = document.createElement('button');
        saveBtn.className = 'bm-btn bm-btn-primary';
        saveBtn.textContent = 'Save';
        saveBtn.addEventListener('click', function () {
            if (nameInput.value && urlInput.value) {
                createBookmark(groupName, nameInput.value, urlInput.value);
            }
        });

        var cancelBtn = document.createElement('button');
        cancelBtn.className = 'bm-btn bm-btn-secondary';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', function () {
            form.remove();
        });

        actions.appendChild(cancelBtn);
        actions.appendChild(saveBtn);
        form.appendChild(nameInput);
        form.appendChild(urlInput);
        form.appendChild(actions);
        cardEl.appendChild(form);
        nameInput.focus();
    }

    function startEditBookmark(listEl, bookmark) {
        removeInlineForms();

        var form = document.createElement('div');
        form.className = 'bm-inline-form';

        var nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.placeholder = 'Name';
        nameInput.value = bookmark.name;

        var urlInput = document.createElement('input');
        urlInput.type = 'text';
        urlInput.placeholder = 'URL';
        urlInput.value = bookmark.url;

        var actions = document.createElement('div');
        actions.className = 'bm-form-actions';

        var saveBtn = document.createElement('button');
        saveBtn.className = 'bm-btn bm-btn-primary';
        saveBtn.textContent = 'Save';
        saveBtn.addEventListener('click', function () {
            if (nameInput.value && urlInput.value) {
                updateBookmark(bookmark.id, nameInput.value, urlInput.value);
            }
        });

        var cancelBtn = document.createElement('button');
        cancelBtn.className = 'bm-btn bm-btn-secondary';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', function () {
            form.remove();
        });

        actions.appendChild(cancelBtn);
        actions.appendChild(saveBtn);
        form.appendChild(nameInput);
        form.appendChild(urlInput);
        form.appendChild(actions);
        listEl.appendChild(form);
        nameInput.focus();
        nameInput.select();
    }

    function startRenameGroup(cardEl, oldName) {
        removeInlineForms();

        var form = document.createElement('div');
        form.className = 'bm-inline-form';

        var nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.placeholder = 'Group name';
        nameInput.value = oldName;

        var actions = document.createElement('div');
        actions.className = 'bm-form-actions';

        var saveBtn = document.createElement('button');
        saveBtn.className = 'bm-btn bm-btn-primary';
        saveBtn.textContent = 'Save';
        saveBtn.addEventListener('click', function () {
            if (nameInput.value && nameInput.value !== oldName) {
                renameGroup(oldName, nameInput.value);
            } else {
                form.remove();
            }
        });

        var cancelBtn = document.createElement('button');
        cancelBtn.className = 'bm-btn bm-btn-secondary';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', function () {
            form.remove();
        });

        actions.appendChild(cancelBtn);
        actions.appendChild(saveBtn);
        form.appendChild(nameInput);
        form.appendChild(actions);
        cardEl.insertBefore(form, cardEl.children[1]);
        nameInput.focus();
        nameInput.select();
    }

    function startAddGroup(sidebarEl) {
        removeInlineForms();

        var form = document.createElement('div');
        form.className = 'bm-inline-form';

        var nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.placeholder = 'New group name';

        var actions = document.createElement('div');
        actions.className = 'bm-form-actions';

        var saveBtn = document.createElement('button');
        saveBtn.className = 'bm-btn bm-btn-primary';
        saveBtn.textContent = 'Create';
        saveBtn.addEventListener('click', function () {
            if (nameInput.value) {
                createGroup(nameInput.value);
            }
        });

        var cancelBtn = document.createElement('button');
        cancelBtn.className = 'bm-btn bm-btn-secondary';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', function () {
            form.remove();
        });

        actions.appendChild(cancelBtn);
        actions.appendChild(saveBtn);
        form.appendChild(nameInput);
        form.appendChild(actions);
        // Insert before the "Add Group" button
        var addGrpBtn = sidebarEl.querySelector('.bm-add-group-btn');
        sidebarEl.insertBefore(form, addGrpBtn);
        nameInput.focus();
    }

    function removeInlineForms() {
        document.querySelectorAll('.bm-inline-form').forEach(function (f) { f.remove(); });
    }

    // --- Bookmark API calls ---

    async function createBookmark(groupName, name, url) {
        var res = await bmFetch(BOOKMARKS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ group_name: groupName, name: name, url: url }),
        });
        if (res.ok) await loadAndRenderBookmarks();
    }

    async function updateBookmark(id, name, url) {
        var res = await bmFetch(BOOKMARKS_URL + '/' + id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name, url: url }),
        });
        if (res.ok) await loadAndRenderBookmarks();
    }

    async function deleteBookmark(id) {
        var res = await bmFetch(BOOKMARKS_URL + '/' + id, { method: 'DELETE' });
        if (res.ok) await loadAndRenderBookmarks();
    }

    async function createGroup(name) {
        var res = await bmFetch(BOOKMARKS_URL + '/groups', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name }),
        });
        if (res.ok) {
            bookmarkData.push({ name: name, items: [] });
            renderSidebar(bookmarkData);
        }
    }

    async function renameGroup(oldName, newName) {
        var res = await bmFetch(BOOKMARKS_URL + '/groups/' + encodeURIComponent(oldName), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ new_name: newName }),
        });
        if (res.ok) await loadAndRenderBookmarks();
    }

    async function deleteGroup(name) {
        var res = await bmFetch(BOOKMARKS_URL + '/groups/' + encodeURIComponent(name), {
            method: 'DELETE',
        });
        if (res.ok) await loadAndRenderBookmarks();
    }

    // --- Login Modal ---

    function setupLoginModal() {
        var modal = document.getElementById('bm-login-modal');
        var closeBtn = document.getElementById('bm-login-close');
        var form = document.getElementById('bm-login-form');

        closeBtn.addEventListener('click', function () {
            modal.classList.add('hidden');
            resetLoginForm();
        });

        modal.addEventListener('click', function (e) {
            if (e.target === modal) {
                modal.classList.add('hidden');
                resetLoginForm();
            }
        });

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            handleLogin();
        });
    }

    function showLoginModal() {
        resetLoginForm();
        document.getElementById('bm-login-modal').classList.remove('hidden');
        document.getElementById('bm-login-user').focus();
    }

    function resetLoginForm() {
        document.getElementById('bm-login-user').value = '';
        document.getElementById('bm-login-pass').value = '';
        document.getElementById('bm-login-totp').value = '';
        document.getElementById('bm-totp-row').classList.add('hidden');
        document.getElementById('bm-login-error').classList.add('hidden');
    }

    var _partialToken = null; // for TOTP step 2

    async function handleLogin() {
        var errorEl = document.getElementById('bm-login-error');
        errorEl.classList.add('hidden');

        var totpRow = document.getElementById('bm-totp-row');

        // If TOTP step is visible, we're doing step 2
        if (_partialToken) {
            var code = document.getElementById('bm-login-totp').value.trim();
            if (!code) return;

            try {
                var res = await fetch('/api/auth/verify-totp', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ partial_token: _partialToken, totp_code: code }),
                });
                var data = await res.json();
                if (!res.ok) throw new Error(data.detail || 'Invalid code');

                setAuthToken(data.token);
                _partialToken = null;
                document.getElementById('bm-login-modal').classList.add('hidden');
                editMode = true;
                refreshEditMode();
            } catch (err) {
                errorEl.textContent = err.message;
                errorEl.classList.remove('hidden');
            }
            return;
        }

        // Step 1: username + password
        var username = document.getElementById('bm-login-user').value.trim();
        var password = document.getElementById('bm-login-pass').value;
        if (!username || !password) return;

        try {
            var res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: username, password: password }),
            });
            var data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Login failed');

            if (data.requires_totp) {
                _partialToken = data.partial_token;
                totpRow.classList.remove('hidden');
                document.getElementById('bm-login-totp').focus();
            } else {
                setAuthToken(data.token);
                document.getElementById('bm-login-modal').classList.add('hidden');
                editMode = true;
                refreshEditMode();
            }
        } catch (err) {
            errorEl.textContent = err.message;
            errorEl.classList.remove('hidden');
        }
    }

    // --- Status Checks (server-side) ---

    async function checkAllStatuses() {
        try {
            var res = await fetch(STATUS_URL, { cache: 'no-store' });
            if (!res.ok) return;
            var statusMap = await res.json(); // { "id": true/false }
            Object.keys(statusMap).forEach(function (id) {
                var card = document.querySelector('.card[data-id="' + id + '"]');
                if (!card) return;
                var dot = card.querySelector('.status-dot');
                if (!dot) return;
                if (statusMap[id]) {
                    dot.classList.add('status-up');
                    dot.classList.remove('status-down');
                } else {
                    dot.classList.add('status-down');
                    dot.classList.remove('status-up');
                }
            });
        } catch (e) {
            // Silently fail — dots stay grey
        }
    }

    // --- Drag-and-Drop Reorder ---

    function setupServiceDragDrop(container) {
        container.addEventListener('pointerdown', function (e) {
            if (!e.target.closest('.card-drag-handle')) return;
            var card = e.target.closest('.card-editable');
            if (!card) return;
            if (e.button !== 0) return;

            e.preventDefault();

            var sourceGrid = card.closest('.grid');
            var sourceSection = card.closest('.category');
            var rect = card.getBoundingClientRect();
            var startX = e.clientX;
            var startY = e.clientY;
            var offsetX = e.clientX - rect.left;
            var offsetY = e.clientY - rect.top;
            var cardW = rect.width;
            var cardH = rect.height;
            var clone = null;
            var placeholder = null;
            var started = false;
            var rafId = 0;
            var lastMoveTime = 0;

            function findTargetGrid(y) {
                // Use heading elements as stable anchors — headings don't shift
                // when cards/placeholders move between grids
                var sections = Array.from(container.querySelectorAll('.category'));
                for (var i = sections.length - 1; i >= 0; i--) {
                    var heading = sections[i].querySelector('.svc-heading-row, h2');
                    if (heading) {
                        var hRect = heading.getBoundingClientRect();
                        if (y >= hRect.top) {
                            return sections[i].querySelector('.grid');
                        }
                    }
                }
                return sections.length > 0 ? sections[0].querySelector('.grid') : null;
            }

            function applyPlaceholder(targetGrid, cx, cy) {
                // Cooldown prevents oscillation from layout reflows
                var now = Date.now();
                if (now - lastMoveTime < 50) return;

                var cards = Array.from(targetGrid.querySelectorAll('.card-editable:not(.card-drag-hidden)'));
                var addBtn = targetGrid.querySelector('.svc-add-btn');
                var insertBefore = addBtn; // default: end of grid

                // Reading-order scan: find first card whose position is "after" cursor
                for (var i = 0; i < cards.length; i++) {
                    var r = cards[i].getBoundingClientRect();
                    if (r.width === 0) continue;

                    var inRow = cy >= r.top - 5 && cy <= r.bottom + 5;
                    if (inRow) {
                        if (cx < r.left + r.width / 2) {
                            insertBefore = cards[i];
                            break;
                        }
                    } else if (cy < r.top) {
                        insertBefore = cards[i];
                        break;
                    }
                }

                // Skip if placeholder is already in correct position
                if (placeholder.parentNode === targetGrid && placeholder.nextSibling === insertBefore) return;

                lastMoveTime = now;
                if (insertBefore) {
                    targetGrid.insertBefore(placeholder, insertBefore);
                } else {
                    targetGrid.appendChild(placeholder);
                }
            }

            function onMove(ev) {
                if (!started) {
                    if (Math.abs(ev.clientX - startX) < 5 && Math.abs(ev.clientY - startY) < 5) return;
                    started = true;

                    clone = card.cloneNode(true);
                    clone.style.cssText =
                        'position:fixed;pointer-events:none;z-index:10000;' +
                        'width:' + cardW + 'px;height:' + cardH + 'px;' +
                        'opacity:0.85;transform:rotate(1.5deg) scale(1.03);' +
                        'box-shadow:0 12px 32px rgba(0,0,0,0.5);transition:none;' +
                        'background:#1e1e1e;border-radius:12px;';
                    document.body.appendChild(clone);

                    card.classList.add('card-drag-hidden');

                    placeholder = document.createElement('div');
                    placeholder.className = 'drag-placeholder';
                    placeholder.style.minHeight = cardH + 'px';
                    sourceGrid.insertBefore(placeholder, card);

                    container.classList.add('grid-dragging');
                }

                clone.style.left = (ev.clientX - offsetX) + 'px';
                clone.style.top = (ev.clientY - offsetY) + 'px';

                // Throttle position updates to one per animation frame
                if (rafId) cancelAnimationFrame(rafId);
                var cx = ev.clientX, cy = ev.clientY;
                rafId = requestAnimationFrame(function () {
                    rafId = 0;
                    var targetGrid = findTargetGrid(cy);
                    if (targetGrid) {
                        applyPlaceholder(targetGrid, cx, cy);
                    }
                });
            }

            function onUp() {
                window.removeEventListener('pointermove', onMove);
                window.removeEventListener('pointerup', onUp);
                if (rafId) cancelAnimationFrame(rafId);
                if (!started) return;

                var targetGrid = placeholder ? placeholder.parentNode : sourceGrid;
                var targetSection = targetGrid ? targetGrid.closest('.category') : null;
                var targetCategory = targetSection ? targetSection.getAttribute('data-category') : null;
                var sourceCategory = sourceSection ? sourceSection.getAttribute('data-category') : null;
                var serviceId = parseInt(card.getAttribute('data-id'), 10);

                // Move card to placeholder position
                if (placeholder && placeholder.parentNode) {
                    targetGrid.insertBefore(card, placeholder);
                    placeholder.remove();
                }
                card.classList.remove('card-drag-hidden');
                container.classList.remove('grid-dragging');
                if (clone) clone.remove();

                // Collect new order in target grid
                var allCards = targetGrid.querySelectorAll('.card[data-id]');
                var ids = Array.from(allCards).map(function (c) {
                    return parseInt(c.getAttribute('data-id'), 10);
                });

                if (targetCategory && targetCategory !== sourceCategory) {
                    moveServiceToCategory(serviceId, targetCategory, ids);
                } else {
                    reorderServices(ids);
                }
            }

            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
        });
    }

    async function moveServiceToCategory(serviceId, newCategory, orderedIds) {
        await bmFetch(SERVICES_URL + '/' + serviceId, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: newCategory }),
        });
        await bmFetch(SERVICES_URL + '/reorder', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: orderedIds }),
        });
        await loadAndRenderServices();
    }

    async function reorderServices(ids) {
        await bmFetch(SERVICES_URL + '/reorder', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: ids }),
        });
        await loadAndRenderServices();
    }

    // --- Group-level Drag-and-Drop (categories + sidebar groups) ---

    function setupCategoryDragDrop(container) {
        var rafPending = false;
        var lastRef = null;

        container.addEventListener('dragover', function (e) {
            var dragging = container.querySelector('.category.dragging-group');
            if (!dragging) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';

            if (rafPending) return;
            rafPending = true;
            var y = e.clientY;

            requestAnimationFrame(function () {
                rafPending = false;
                var dragging = container.querySelector('.category.dragging-group');
                if (!dragging) return;

                var sections = Array.from(container.querySelectorAll('.category:not(.dragging-group)'));
                var insertBefore = null;

                for (var i = 0; i < sections.length; i++) {
                    var rect = sections[i].getBoundingClientRect();
                    if (y < rect.top + rect.height / 2) {
                        insertBefore = sections[i];
                        break;
                    }
                }

                // Default: insert before the add-category button
                if (!insertBefore) {
                    insertBefore = container.querySelector('.svc-add-cat-btn');
                }

                if (insertBefore !== lastRef) {
                    lastRef = insertBefore;
                    if (insertBefore) {
                        container.insertBefore(dragging, insertBefore);
                    } else {
                        container.appendChild(dragging);
                    }
                }
            });
        });

        container.addEventListener('drop', function (e) {
            var dragging = container.querySelector('.category.dragging-group');
            if (!dragging) return;
            e.preventDefault();
            lastRef = null;
            var sections = container.querySelectorAll('.category[data-category]');
            var names = Array.from(sections).map(function (s) {
                return s.getAttribute('data-category');
            });
            reorderCategories(names);
        });
    }

    async function reorderCategories(names) {
        await bmFetch(SERVICES_URL + '/categories/reorder', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ names: names }),
        });
        await loadAndRenderServices();
    }

    function setupSidebarGroupDragDrop(sidebar) {
        sidebar.addEventListener('dragover', function (e) {
            var dragging = sidebar.querySelector('.sidebar-card.dragging-group');
            if (!dragging) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';

            var cards = Array.from(sidebar.querySelectorAll('.sidebar-card:not(.dragging-group)'));
            var closest = null;
            var closestDist = Infinity;

            cards.forEach(function (c) {
                var rect = c.getBoundingClientRect();
                var centerY = rect.top + rect.height / 2;
                var dist = Math.abs(e.clientY - centerY);
                if (dist < closestDist) {
                    closestDist = dist;
                    closest = c;
                }
            });

            if (closest) {
                var rect = closest.getBoundingClientRect();
                var midY = rect.top + rect.height / 2;
                if (e.clientY < midY) {
                    sidebar.insertBefore(dragging, closest);
                } else {
                    sidebar.insertBefore(dragging, closest.nextSibling);
                }
            }
        });

        sidebar.addEventListener('drop', function (e) {
            var dragging = sidebar.querySelector('.sidebar-card.dragging-group');
            if (!dragging) return;
            e.preventDefault();
            var cards = sidebar.querySelectorAll('.sidebar-card[data-group]');
            var names = Array.from(cards).map(function (c) {
                return c.getAttribute('data-group');
            });
            reorderBookmarkGroups(names);
        });
    }

    async function reorderBookmarkGroups(names) {
        await bmFetch(BOOKMARKS_URL + '/groups/reorder', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ names: names }),
        });
        await loadAndRenderBookmarks();
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
            var tag = document.activeElement && document.activeElement.tagName;
            var isTyping = tag === 'INPUT' || tag === 'TEXTAREA';

            // "/" focuses search
            if (e.key === '/' && !isTyping) {
                e.preventDefault();
                searchInput.focus();
                return;
            }

            // Escape: close modal / remove inline forms / clear search
            if (e.key === 'Escape') {
                var modal = document.getElementById('bm-login-modal');
                if (!modal.classList.contains('hidden')) {
                    modal.classList.add('hidden');
                    resetLoginForm();
                    return;
                }
                var forms = document.querySelectorAll('.bm-inline-form');
                if (forms.length) {
                    forms.forEach(function (f) { f.remove(); });
                    return;
                }
                searchInput.value = '';
                filterServices('');
                searchInput.blur();
                return;
            }

            // Number keys open shortcuts (only when not typing)
            if (!isTyping && e.key >= '1' && e.key <= '9') {
                var card = document.querySelector('.card[data-shortcut="' + e.key + '"]:not(.hidden)');
                if (card) {
                    var href = card.href || card.getAttribute('data-url');
                    if (href) {
                        location.href = href;
                    }
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
