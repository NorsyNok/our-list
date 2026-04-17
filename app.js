// ========== ИМПОРТЫ ==========
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, push, onChildAdded, onChildChanged, onChildRemoved, remove, update, set, get } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// ========== КОНФИГУРАЦИЯ ==========
const firebaseConfig = {
    apiKey: "AIzaSyCwm8sRAM42jiNllmsgGEJ-VAkHoLKiy7s",
    authDomain: "our-list-demo.firebaseapp.com",
    databaseURL: "https://our-list-demo-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "our-list-demo",
    storageBucket: "our-list-demo.firebasestorage.app",
    messagingSenderId: "451385759985",
    appId: "1:451385759985:web:fd96ee8288a5bc81973150",
    measurementId: "G-PMXSVMHTX2"
};

// ========== ИНИЦИАЛИЗАЦИЯ ==========
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const auth = getAuth(app);

// ========== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ==========
let User = null;
let ListId = null;
let ListRef = null;
let ListName = "";
let unsubscribeItems = null;
let pendingUndo = null;
let undoTimeout = null;

// ========== DOM ЭЛЕМЕНТЫ ==========
const shoppingListDiv = document.getElementById('shoppingList');
const addForm = document.getElementById('addForm');
const itemInput = document.getElementById('itemInput');
const syncStatusSpan = document.getElementById('syncStatus');
const menuBtn = document.getElementById('menuBtn');
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('overlay');
const closeSidebarBtn = document.getElementById('closeSidebarBtn');
const listsContainer = document.getElementById('listsContainer');
const newListName = document.getElementById('newListName');
const createListBtn = document.getElementById('createListBtn');
const inviteCodeInput = document.getElementById('inviteCodeInput');
const joinListBtn = document.getElementById('joinListBtn');
const userIdDisplay = document.getElementById('userIdDisplay');
const listNameSpan = document.getElementById('listName');
const listCodeSpan = document.getElementById('listCode');
const copyCodeBtn = document.getElementById('copyCodeBtn');

// ========== TOAST ФУНКЦИИ ==========
function showUndoToast(message, onUndo) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    const undoBtn = document.getElementById('toastUndoBtn');
    
    if (!toast || !toastMessage || !undoBtn) return;
    
    if (undoTimeout) {
        clearTimeout(undoTimeout);
        pendingUndo = null;
    }
    
    pendingUndo = onUndo;
    toastMessage.textContent = message;
    toast.classList.remove('success', 'error', 'warning', 'info', 'show');
    toast.classList.add('info');
    
    const newUndoBtn = undoBtn.cloneNode(true);
    undoBtn.parentNode.replaceChild(newUndoBtn, undoBtn);
    
    newUndoBtn.addEventListener('click', () => {
        if (pendingUndo) {
            pendingUndo();
            hideToast();
            pendingUndo = null;
            if (undoTimeout) clearTimeout(undoTimeout);
        }
    });
    
    setTimeout(() => toast.classList.add('show'), 10);
    
    undoTimeout = setTimeout(() => {
        hideToast();
        pendingUndo = null;
    }, 5000);
}

function hideToast() {
    const toast = document.getElementById('toast');
    if (toast) toast.classList.remove('show');
}

function showSimpleToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    const undoBtn = document.getElementById('toastUndoBtn');
    
    if (!toast || !toastMessage) return;
    
    if (undoBtn) undoBtn.style.display = 'none';
    
    toastMessage.textContent = message;
    toast.classList.remove('success', 'error', 'warning', 'info', 'show');
    toast.classList.add(type);
    
    setTimeout(() => toast.classList.add('show'), 10);
    
    setTimeout(() => {
        toast.classList.remove('show');
        if (undoBtn) undoBtn.style.display = '';
    }, 2000);
}

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========
function setSyncStatus(message) {
    if (syncStatusSpan) {
        syncStatusSpan.textContent = message;
        setTimeout(() => {
            if (syncStatusSpan.textContent === message) {
                syncStatusSpan.textContent = 'Синхронизация включена';
            }
        }, 1500);
    }
}

function generateListId() {
    return Math.random().toString(36).substring(2, 10) + 
           Math.random().toString(36).substring(2, 6);
}

function toggleSidebar() {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('show');
}

// ========== АУТЕНТИФИКАЦИЯ ==========
function initAuth() {
    signInAnonymously(auth)
        .then(() => {
            console.log("Анонимный вход выполнен");
        })
        .catch((error) => {
            console.error("Ошибка входа:", error);
            showSimpleToast("Ошибка подключения", "error");
        });
}

// ========== UI ФУНКЦИИ ДЛЯ ЭЛЕМЕНТОВ СПИСКА ==========
function addItemToUI(itemId, itemData) {
    const emptyDiv = shoppingListDiv.querySelector('.empty-state');
    if (emptyDiv) {
        emptyDiv.remove();
    }

    const itemDiv = document.createElement('div');
    itemDiv.className = 'list-item';
    itemDiv.dataset.id = itemId;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = itemData.checked || false;
    checkbox.addEventListener('change', async () => {
        await update(ref(database, `lists/${ListId}/items/${itemId}`), {
            checked: checkbox.checked
        });
    });

    const nameSpan = document.createElement('span');
    nameSpan.className = 'item-name';
    if (itemData.checked) nameSpan.classList.add('checked');
    nameSpan.textContent = itemData.name;

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '🗑️';
    deleteBtn.className = 'delete-btn';
    deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const itemName = itemData.name;
        const deletedItemData = { ...itemData };
        
        const itemDivToRemove = deleteBtn.closest('.list-item');
        itemDivToRemove.style.transition = 'opacity 0.2s';
        itemDivToRemove.style.opacity = '0';
        
        await remove(ref(database, `lists/${ListId}/items/${itemId}`));
        
        showUndoToast(`"${itemName}" удален`, async () => {
            await push(ref(database, `lists/${ListId}/items`), deletedItemData);
            showSimpleToast(`"${itemName}" восстановлен`, 'success');
        });
    });

    itemDiv.appendChild(checkbox);
    itemDiv.appendChild(nameSpan);
    itemDiv.appendChild(deleteBtn);
    shoppingListDiv.appendChild(itemDiv);
    itemDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function updateItemInUI(itemId, changedData) {
    const itemDiv = shoppingListDiv.querySelector(`.list-item[data-id="${itemId}"]`);
    if (!itemDiv) return;
    
    const checkbox = itemDiv.querySelector('input[type="checkbox"]');
    const nameSpan = itemDiv.querySelector('.item-name');
    
    if (changedData.checked !== undefined) {
        checkbox.checked = changedData.checked;
        if (changedData.checked) {
            nameSpan.classList.add('checked');
        } else {
            nameSpan.classList.remove('checked');
        }
    }
}

function removeItemFromUI(itemId) {
    const itemDiv = shoppingListDiv.querySelector(`.list-item[data-id="${itemId}"]`);
    if (itemDiv) {
        itemDiv.remove();
        if (shoppingListDiv.children.length === 0) {
            shoppingListDiv.innerHTML = '<div class="empty-state">Тут ничего нет...</div>';
        }
    }
}

// ========== ПОДПИСКА НА ЭЛЕМЕНТЫ СПИСКА ==========
function subscribeToListItems() {
    if (!ListRef) return;
    
    // Отписываемся от предыдущей подписки
    if (unsubscribeItems) {
        unsubscribeItems();
    }
    
    // Создаем новые слушатели
    const onAdded = onChildAdded(ListRef, (snapshot) => {
        addItemToUI(snapshot.key, snapshot.val());
        setSyncStatus('синхронизировано');
    });
    
    const onChanged = onChildChanged(ListRef, (snapshot) => {
        updateItemInUI(snapshot.key, snapshot.val());
    });
    
    const onRemoved = onChildRemoved(ListRef, (snapshot) => {
        removeItemFromUI(snapshot.key);
    });
    
    // Функция для отписки
    unsubscribeItems = () => {
        onAdded();
        onChanged();
        onRemoved();
        unsubscribeItems = null;
    };
}

// ========== УПРАВЛЕНИЕ СПИСКАМИ ==========
async function loadUserLists() {
    if (!User) return;
    
    listsContainer.innerHTML = '<div class="loading"></div>';
    
    const userListsRef = ref(database, `users/${User.uid}/lists`);
    const snapshot = await get(userListsRef);
    
    if (!snapshot.exists()) {
        listsContainer.innerHTML = '<div class="empty-state">Нет списков.<br>Создайте первый!</div>';
        return;
    }
    
    const lists = snapshot.val();
    listsContainer.innerHTML = '';
    
    for (const [listId, listData] of Object.entries(lists)) {
        const listElement = document.createElement('div');
        listElement.className = 'list-item-sidebar';
        if (listId === ListId) listElement.classList.add('active');
        
        listElement.innerHTML = `
            <span class="list-name">${listData.name}</span>
            <button class="delete-list-btn" data-id="${listId}">🗑️</button>
        `;
        
        listElement.addEventListener('click', (e) => {
            if (e.target.classList.contains('delete-list-btn')) return;
            switchList(listId, listData.name);
        });
        
        const deleteBtn = listElement.querySelector('.delete-list-btn');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteList(listId, listData.name);
        });
        
        listsContainer.appendChild(listElement);
    }
}

function switchList(listId, listName) {
    if (ListId === listId) return;
    
    if (unsubscribeItems) {
        unsubscribeItems();
    }

    ListId = listId;
    ListName = listName;
    ListRef = ref(database, `lists/${listId}/items`);

    shoppingListDiv.innerHTML = '<div class="empty-state">загрузка...</div>';
    
    listNameSpan.textContent = listName;
    listCodeSpan.textContent = listId;

    if (listNameSpan) {
        listNameSpan.textContent = listName;
    }
    if (listCodeSpan) {
        listCodeSpan.textContent = listId;
    }
    
    // Подписываемся на новый список
    subscribeToListItems();
    
    // Обновляем активный элемент в боковой панели
    document.querySelectorAll('.list-item-sidebar').forEach(el => {
        el.classList.remove('active');
    });
    
    // Находим и отмечаем активный список
    const activeItem = Array.from(document.querySelectorAll('.list-item-sidebar')).find(
        el => el.querySelector('.list-name')?.textContent.includes(listName)
    );
    if (activeItem) activeItem.classList.add('active');
    
    toggleSidebar();
    showSimpleToast(`Переключено на "${listName}"`, 'success');
}

async function createList() {
    const name = newListName.value.trim();
    if (!name) {
        showSimpleToast('Введите название списка', 'warning');
        return;
    }
    
    if (!User) return;
    
    const listId = generateListId();
    const listData = {
        name: name,
        owner: User.uid,
        createdAt: Date.now()
    };
    
    try {
        await set(ref(database, `lists/${listId}`), listData);
        await set(ref(database, `users/${User.uid}/lists/${listId}`), {
            name: name,
            role: 'owner'
        });
        
        newListName.value = '';
        showSimpleToast(`Список "${name}" создан!`, 'success');
        await loadUserLists();
        switchList(listId, name);
    } catch (error) {
        console.error(error);
        showSimpleToast('Ошибка создания', 'error');
    }
}

async function deleteList(listId, listName) {
    if (!confirm(`Удалить список "${listName}"? Все товары будут потеряны!`)) return;
    
    try {
        await remove(ref(database, `lists/${listId}`));
        await remove(ref(database, `users/${User.uid}/lists/${listId}`));
        
        showSimpleToast(`Список "${listName}" удален`, 'warning');
        await loadUserLists();
        
        const snapshot = await get(ref(database, `users/${User.uid}/lists`));
        const lists = snapshot.val();
        
        if (lists) {
            const firstListId = Object.keys(lists)[0];
            const firstListData = lists[firstListId];
            switchList(firstListId, firstListData.name);
        } else {
            ListId = null;
            ListRef = null;
            shoppingListDiv.innerHTML = '<div class="empty-state">cоздайте первый список в меню</div>';
            listNameSpan.textContent = 'Нет списка';
            listCodeSpan.textContent = '-';
            if (unsubscribeItems) {
                unsubscribeItems();
                unsubscribeItems = null;
            }
        }
    } catch (error) {
        console.error(error);
        showSimpleToast('Ошибка удаления', 'error');
    }
}

async function joinListByCode() {
    const inviteCode = inviteCodeInput.value.trim().toLowerCase();
    if (!inviteCode) {
        showSimpleToast('Введите код приглашения', 'warning');
        return;
    }
    
    if (!User) return;
    
    try {
        const listSnapshot = await get(ref(database, `lists/${inviteCode}`));
        
        if (!listSnapshot.exists()) {
            showSimpleToast('Список не найден! Проверьте код', 'error');
            return;
        }
        
        const listData = listSnapshot.val();
        
        await set(ref(database, `users/${User.uid}/lists/${inviteCode}`), {
            name: listData.name,
            role: 'member'
        });
        
        inviteCodeInput.value = '';
        showSimpleToast(`Вы присоединились к "${listData.name}"!`, 'success');
        await loadUserLists();
        switchList(inviteCode, listData.name);
    } catch (error) {
        console.error(error);
        showSimpleToast('Ошибка при подключении', 'error');
    }
}

function copyListCode() {
    if (!ListId) {
        showSimpleToast('Нет активного списка', 'warning');
        return;
    }
    
    navigator.clipboard.writeText(ListId);
    showSimpleToast('Код скопирован! Отправьте другу', 'success');
}

// ========== ОБРАБОТЧИКИ СОБЫТИЙ ==========
menuBtn.addEventListener('click', toggleSidebar);
closeSidebarBtn.addEventListener('click', toggleSidebar);
overlay.addEventListener('click', toggleSidebar);

createListBtn.addEventListener('click', createList);
joinListBtn.addEventListener('click', joinListByCode);
copyCodeBtn.addEventListener('click', copyListCode);

newListName.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') createList();
});
inviteCodeInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') joinListByCode();
});

addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!ListId) {
        showSimpleToast('Сначала выберите или создайте список', 'warning');
        return;
    }
    
    const itemName = itemInput.value.trim();
    if (!itemName) return;
    
    try {
        await push(ref(database, `lists/${ListId}/items`), {
            name: itemName,
            checked: false,
            createdAt: Date.now(),
            createdBy: User?.uid
        });
        itemInput.value = '';
        itemInput.focus();
    } catch (error) {
        console.error(error);
        showSimpleToast('Ошибка добавления', 'error');
    }
});

// ========== АУТЕНТИФИКАЦИЯ И ЗАПУСК ==========
onAuthStateChanged(auth, async (user) => {
    if (user) {
        User = user;
        if (userIdDisplay) {
            userIdDisplay.textContent = user.uid.substring(0, 8) + '...';
        }
        console.log("Пользователь:", user.uid);
        showSimpleToast("Вы вошли в систему", "success");
        await loadUserLists();
        
        // Автоматически выбираем первый список
        const snapshot = await get(ref(database, `users/${user.uid}/lists`));
        const lists = snapshot.val();
        
        if (lists) {
            const firstListId = Object.keys(lists)[0];
            const firstListData = lists[firstListId];
            switchList(firstListId, firstListData.name);
        }
    } else {
        initAuth();
    }
});

// Фокус на поле ввода при загрузке
window.addEventListener('load', () => {
    itemInput.focus();
});

console.log("🎯 Приложение готово!");