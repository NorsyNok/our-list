//Импорт Firebase модулей
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, push, onChildAdded, onChildChanged, onChildRemoved, remove, update } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

//Конфиг моего Firebase
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

let currentUser = null;
let currentListId = null;
let currentListRef = null;
let currentListName = "";
let unsubscribeItems = null;

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

const auth = getAuth(app);
initAuth();

const ROOM_ID = "pokupki";
const listRef = ref(database, `shoppingLists/${ROOM_ID}/items`);

const roomIdSpan = document.getElementById('roomId');
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
const currentListNameSpan = document.getElementById('currentListName');
const listCodeSpan = document.getElementById('listCode');
const copyCodeBtn = document.getElementById('copyCodeBtn');

roomIdSpan.textContent = ROOM_ID;

let pendingUndo = null;
let undoTimeout = null;

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

function setSyncStatus(message, isSyncing = false) {
    syncStatusSpan.textContent = message;

    // Возвращаем обычный статус через 1.5 секунды
    if (isSyncing) {
        setTimeout(() => {
            if (syncStatusSpan.textContent === message) {
                setSyncStatus('синхронизировано', false);
            }
        }, 1500);
    }
}

function toggleSidebar() {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('show');
}

menuBtn.addEventListener('click', toggleSidebar);
closeSidebarBtn.addEventListener('click', toggleSidebar);
overlay.addEventListener('click', toggleSidebar);

async function loadUserLists() {
    if (!currentUser) return;
    
    listsContainer.innerHTML = '<div class="loading">Загрузка...</div>';
    
    const userListsRef = ref(database, `users/${currentUser.uid}/lists`);
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
        if (listId === currentListId) listElement.classList.add('active');
        
        listElement.innerHTML = `
            <span class="list-name">📋 ${listData.name}</span>
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
    if (currentListId === listId) return;
    
    // Отписываемся от старого списка
    if (unsubscribeItems) {
        unsubscribeItems();
    }
    
    currentListId = listId;
    currentListName = listName;
    currentListRef = ref(database, `lists/${listId}/items`);
    
    currentListNameSpan.textContent = listName;
    listCodeSpan.textContent = listId;
    
    // Очищаем UI
    shoppingListDiv.innerHTML = '<div class="empty-state">Загрузка...</div>';
    
    // Подписываемся на новый список
    subscribeToListItems();
    
    // Обновляем активный элемент в боковой панели
    document.querySelectorAll('.list-item-sidebar').forEach(el => {
        el.classList.remove('active');
    });
    
    toggleSidebar();
    showSimpleToast(`Переключено на "${listName}"`, 'success');
}

function subscribeToListItems() {
    if (!currentListRef) return;
    
    // Функции UI для элементов списка
    function addItemToUI(itemId, itemData) {
        const emptyDiv = shoppingListDiv.querySelector('.empty-state');
        if (emptyDiv && emptyDiv.textContent.includes('пуст')) emptyDiv.remove();
        
        const itemDiv = document.createElement('div');
        itemDiv.className = 'list-item';
        itemDiv.dataset.id = itemId;
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = itemData.checked || false;
        checkbox.addEventListener('change', async () => {
            await update(ref(database, `lists/${currentListId}/items/${itemId}`), {
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
            
            await remove(ref(database, `lists/${currentListId}/items/${itemId}`));
            
            showUndoToast(`"${itemName}" удален`, async () => {
                await push(ref(database, `lists/${currentListId}/items`), deletedItemData);
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
        if (itemDiv) itemDiv.remove();
        if (shoppingListDiv.children.length === 0) {
            shoppingListDiv.innerHTML = '<div class="empty-state">✨ Список пуст. Добавьте первый продукт!</div>';
        }
    }
    
    // Устанавливаем слушатели
    const onAdded = onChildAdded(currentListRef, (snapshot) => {
        addItemToUI(snapshot.key, snapshot.val());
        setSyncStatus('✅ Синхронизировано');
    });
    
    const onChanged = onChildChanged(currentListRef, (snapshot) => {
        updateItemInUI(snapshot.key, snapshot.val());
    });
    
    const onRemoved = onChildRemoved(currentListRef, (snapshot) => {
        removeItemFromUI(snapshot.key);
    });
    
    // Функция для отписки
    unsubscribeItems = () => {
        onAdded();
        onChanged();
        onRemoved();
    };
}

async function createList() {
    const name = newListName.value.trim();
    if (!name) {
        showSimpleToast('Введите название списка', 'warning');
        return;
    }
    
    if (!currentUser) return;
    
    const listId = generateListId();
    const listData = {
        name: name,
        owner: currentUser.uid,
        createdAt: Date.now(),
        items: {}
    };
    
    try {
        // Создаем список в базе
        await set(ref(database, `lists/${listId}`), listData);
        
        // Добавляем ссылку для пользователя
        await set(ref(database, `users/${currentUser.uid}/lists/${listId}`), {
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

function generateListId() {
    return Math.random().toString(36).substring(2, 10) + 
           Math.random().toString(36).substring(2, 6);
}
async function deleteList(listId, listName) {
    if (!confirm(`Удалить список "${listName}"? Все товары будут потеряны!`)) return;
    
    try {
        await remove(ref(database, `lists/${listId}`));
        await remove(ref(database, `users/${currentUser.uid}/lists/${listId}`));
        
        showSimpleToast(`Список "${listName}" удален`, 'warning');
        await loadUserLists();
        
        // Если удалили текущий список - переключаемся на первый доступный
        const snapshot = await get(ref(database, `users/${currentUser.uid}/lists`));
        const lists = snapshot.val();
        
        if (lists) {
            const firstListId = Object.keys(lists)[0];
            const firstListData = lists[firstListId];
            switchList(firstListId, firstListData.name);
        } else {
            // Нет списков - создаем пустое состояние
            currentListId = null;
            shoppingListDiv.innerHTML = '<div class="empty-state">✨ Создайте первый список в меню</div>';
            currentListNameSpan.textContent = 'Нет списка';
            listCodeSpan.textContent = '-';
        }
    } catch (error) {
        console.error(error);
        showSimpleToast('Ошибка удаления', 'error');
    }
}

// ========== ПРИСОЕДИНЕНИЕ ПО ПРИГЛАШЕНИЮ ==========
async function joinListByCode() {
    const inviteCode = inviteCodeInput.value.trim().toLowerCase();
    if (!inviteCode) {
        showSimpleToast('Введите код приглашения', 'warning');
        return;
    }
    
    if (!currentUser) return;
    
    try {
        // Проверяем, существует ли список
        const listSnapshot = await get(ref(database, `lists/${inviteCode}`));
        
        if (!listSnapshot.exists()) {
            showSimpleToast('Список не найден! Проверьте код', 'error');
            return;
        }
        
        const listData = listSnapshot.val();
        
        // Добавляем пользователя к списку
        await set(ref(database, `users/${currentUser.uid}/lists/${inviteCode}`), {
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

// ========== КОПИРОВАНИЕ КОДА СПИСКА ==========
function copyListCode() {
    if (!currentListId) {
        showSimpleToast('Нет активного списка', 'warning');
        return;
    }
    
    navigator.clipboard.writeText(currentListId);
    showSimpleToast('Код скопирован! Отправьте другу', 'success');
}

createListBtn.addEventListener('click', createList);
joinListBtn.addEventListener('click', joinListByCode);
copyCodeBtn.addEventListener('click', copyListCode);

addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!currentListId) {
        showSimpleToast('Сначала выберите или создайте список', 'warning');
        return;
    }
    
    const itemName = itemInput.value.trim();
    if (!itemName) return;
    
    try {
        await push(ref(database, `lists/${currentListId}/items`), {
            name: itemName,
            checked: false,
            createdAt: Date.now(),
            createdBy: currentUser?.uid
        });
        itemInput.value = '';
        itemInput.focus();
    } catch (error) {
        console.error(error);
        showSimpleToast('Ошибка добавления', 'error');
    }
});
function addItemToUI(itemId, itemData) {
    // Убираем empty-state если он есть
    const emptyDiv = shoppingListDiv.querySelector('.empty-state');
    if (emptyDiv) emptyDiv.remove();

    // Создаем элемент списка
    const itemDiv = document.createElement('div');
    itemDiv.className = 'list-item';
    itemDiv.dataset.id = itemId;

    // Чекбокс
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = itemData.checked || false;
    checkbox.addEventListener('change', async (e) => {
        e.stopPropagation();
        setSyncStatus('обновляем...', true);
        await update(ref(database, `shoppingLists/${ROOM_ID}/items/${itemId}`), {
            checked: checkbox.checked
        });
    });

    // Название
    const nameSpan = document.createElement('span');
    nameSpan.className = 'item-name';
    if (itemData.checked) nameSpan.classList.add('checked');
    nameSpan.textContent = itemData.name;

    // Кнопка удаления
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '🗑️';
    deleteBtn.className = 'delete-btn';
    deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();

        const itemName = itemData.name;
        const deletedItemId = itemId;
        const deletedItemData = { ...itemData };

        const itemDiv = deleteBtn.closest('.list-item');
        itemDiv.classList.add('removing');
        itemDiv.style.transition = 'opacity 0.2s';
        itemDiv.style.opacity = '0';
        setSyncStatus('удаление...', true);

        setTimeout(async () => {
        await remove(ref(database, `shoppingLists/${ROOM_ID}/items/${itemId}`));
        }, 150);

        showUndoToast(`"${itemName}" удален`, async () => {
        await push(ref(database, `shoppingLists/${ROOM_ID}/items`), deletedItemData);
        showSimpleToast(`"${itemName}" восстановлен`, 'success');
    });
    });

    itemDiv.appendChild(checkbox);
    itemDiv.appendChild(nameSpan);
    itemDiv.appendChild(deleteBtn);
    shoppingListDiv.appendChild(itemDiv);
    
    // Скроллим к новому элементу
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
        } 
        else {
            nameSpan.classList.remove('checked');
        }
    }
}
function removeItemFromUI(itemId) {
    const itemDiv = shoppingListDiv.querySelector(`.list-item[data-id="${itemId}"]`);
    if (itemDiv) {
        itemDiv.style.animation = 'fadeIn 0.2s reverse';
        setTimeout(() => {
            itemDiv.remove();
            
            // Если список стал пустым, показываем empty-state
            if (shoppingListDiv.children.length === 0) {
                const emptyDiv = document.createElement('div');
                emptyDiv.className = 'empty-state';
                emptyDiv.textContent = 'Тут ничего нет...';
                shoppingListDiv.appendChild(emptyDiv);
            }
        }, 200);
    }
}
function showUndoToast(message, onUndo) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    const undoBtn = document.getElementById('toastUndoBtn');
    
    if (!toast || !toastMessage || !undoBtn) return;
    
    // Очищаем предыдущий таймаут и действие
    if (undoTimeout) {
        clearTimeout(undoTimeout);
        pendingUndo = null;
    }
    
    // Устанавливаем новое действие отмены
    pendingUndo = onUndo;
    
    // Настраиваем текст
    toastMessage.textContent = message;
    
    // Убираем предыдущие классы
    toast.classList.remove('info', 'show');
    toast.classList.add('info');
    
    // Настраиваем кнопку отмены
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
    
    // Показываем тост
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    
    // Автоматически скрываем через 5 секунд
    undoTimeout = setTimeout(() => {
        hideToast();
        pendingUndo = null;
    }, 5000);
}

// Скрыть тост
function hideToast() {
    const toast = document.getElementById('toast');
    if (toast) {
        toast.classList.remove('show');
    }
}

// Простое уведомление (без отмены)
function showSimpleToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    const undoBtn = document.getElementById('toastUndoBtn');
    
    if (!toast || !toastMessage) return;
    
    // Прячем кнопку отмены
    if (undoBtn) undoBtn.style.display = 'none';
    
    toastMessage.textContent = message;
    toast.classList.remove('info', 'show');
    toast.classList.add(type);
    
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    
    setTimeout(() => {
        toast.classList.remove('show');
        if (undoBtn) undoBtn.style.display = '';
    }, 2000);
}

// REAL-TIME СЛУШАТЕЛИ FIREBASE
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        console.log("👤 Пользователь:", user.uid);
        showSimpleToast("Вы вошли в систему", "success");
        loadUserLists(); // Загружаем списки пользователя
    } else {
        initAuth(); // Если нет пользователя - входим
    }
});
// Добавление новых элементов
onChildAdded(listRef, (snapshot) => {
    const itemId = snapshot.key;
    const itemData = snapshot.val();
    addItemToUI(itemId, itemData);
    setSyncStatus('синхронизировано', false);
});

// Изменение существующих элементов
onChildChanged(listRef, (snapshot) => {
    const itemId = snapshot.key;
    const changedData = snapshot.val();
    updateItemInUI(itemId, changedData);
    setSyncStatus('обновляем...', false);
});

// Удаление элементов
onChildRemoved(listRef, (snapshot) => {
    const itemId = snapshot.key;
    removeItemFromUI(itemId);
    setSyncStatus('удалено', false);
});

// Обработка формы добавления
addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const itemName = itemInput.value.trim();
    if (!itemName) return;

    setSyncStatus('добавляем...', true);
    
    await push(listRef, {
        name: itemName,
        checked: false,
        createdAt: Date.now()
    });

    itemInput.value = '';
    itemInput.focus();
});

// Фокус на поле ввода при загрузке
window.addEventListener('load', () => {
    itemInput.focus();
});

newListName.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') createList();
});
inviteCodeInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') joinListByCode();
});

console.log("🎯 Приложение готово!");