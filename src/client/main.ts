import * as blitsy from 'blitsy';
import { secondsToTime, fakedownToTag, eventToElementPixel, withPixels } from './utility';
import { sleep } from '../common/utility';
import { ChatPanel } from './chat';

import ZoneClient from '../common/client';
import { ZoneSceneRenderer, avatarImage, tilemapContext, blockTexture } from './scene';
import { Player } from './player';
import { UserState, UserEcho } from '../common/zone';
import { HTMLUI } from './html-ui';
import { createContext2D } from 'blitsy';
import { menusFromDataAttributes } from './menus';

window.addEventListener('load', () => load());

export const client = new ZoneClient();
export const htmlui = new HTMLUI();

const avatarTiles = new Map<string | undefined, CanvasRenderingContext2D>();
avatarTiles.set(undefined, avatarImage);

function decodeBase64(data: string) {
    const texture: blitsy.TextureData = {
        _type: 'texture',
        format: 'M1',
        width: 8,
        height: 8,
        data,
    };
    return blitsy.decodeTexture(texture);
}

function getTile(base64: string | undefined): CanvasRenderingContext2D {
    if (!base64) return avatarImage;
    let tile = avatarTiles.get(base64);
    if (!tile) {
        try {
            tile = decodeBase64(base64);
            avatarTiles.set(base64, tile);
        } catch (e) {
            console.log('fucked up avatar', base64);
        }
    }
    return tile || avatarImage;
}

function notify(title: string, body: string, tag: string) {
    if ('Notification' in window && Notification.permission === 'granted' && !document.hasFocus()) {
        const notification = new Notification(title, { body, tag, renotify: true, icon: './avatar.png' });
    }
}

function parseFakedown(text: string) {
    text = fakedownToTag(text, '##', 'shk');
    text = fakedownToTag(text, '~~', 'wvy');
    text = fakedownToTag(text, '==', 'rbw');
    return text;
}

const chat = new ChatPanel();

function getLocalUser() {
    if (!client.localUserId) {
        // chat.log("{clr=#FF0000}ERROR: no localUserId");
    } else {
        client.localUser = client.zone.getUser(client.localUserId!);
        return client.localUser;
    }
}

function moveTo(x: number, y: number, z: number) {
    const user = getLocalUser()!;
    user.position = [x, y, z];
}

const emoteToggles = new Map<string, Element>();
const getEmote = (emote: string) => emoteToggles.get(emote)?.classList.contains('active');

let localName = localStorage.getItem('name') || '';

async function connect(): Promise<void> {
    const joined = !!client.localUserId;

    chat.log('{clr=#00FF00}*** connected ***');
    if (!joined) listHelp();
    listUsers();
}

function listUsers() {
    const named = Array.from(client.zone.users.values()).filter((user) => !!user.name);

    if (named.length === 0) {
        chat.status('no other users');
    } else {
        const names = named.map((user) => user.name);
        const line = names.join('{clr=#FF00FF}, {clr=#FF0000}');
        chat.status(`${names.length} users: {clr=#FF0000}${line}`);
    }
}

const help = [
    'use the tabs on the bottom left to queue songs, chat to others, and change your appearance. click or arrow keys to move.',
].join('\n');

function listHelp() {
    chat.log('{clr=#FFFF00}' + help);
}

export async function load() {
    htmlui.addElementsInRoot(document.body);
    htmlui.hideAllWindows();

    const popoutPanel = document.getElementById('popout-panel') as HTMLElement;
    const video = document.createElement('video');
    popoutPanel.appendChild(video);
    document.getElementById('popout-button')?.addEventListener('click', () => (popoutPanel.hidden = false));

    const player = new Player(video);
    const zoneLogo = document.createElement('img');
    zoneLogo.src = 'zone-logo.png';
    const audioLogo = document.createElement('img');
    audioLogo.src = 'audio-logo.png';

    const joinName = document.querySelector('#join-name') as HTMLInputElement;
    const chatInput = document.querySelector('#chat-input') as HTMLInputElement;

    function setVolume(volume: number) {
        player.volume = volume / 100;
        localStorage.setItem('volume', volume.toString());
    }

    setVolume(parseInt(localStorage.getItem('volume') || '100', 10));

    joinName.value = localName;

    const menuPanel = document.getElementById('menu-panel')!;
    const volumeSlider = document.getElementById('volume-slider') as HTMLInputElement;

    volumeSlider.addEventListener('input', () => (player.volume = parseFloat(volumeSlider.value)));
    document.getElementById('menu-button')?.addEventListener('click', openMenu);

    function openMenu() {
        menuPanel.hidden = false;
        volumeSlider.value = player.volume.toString();
    }

    function formatName(user: UserState) {
        if (user.tags.includes('admin')) {
            return `<span class="user-admin">${user.name}</span>`;
        } else if (user.tags.includes('dj')) {
            return `<span class="user-dj">${user.name}</span>`;
        } else {
            return user.name || '';
        }
    }

    const iconTest = createContext2D(8, 8);
    iconTest.fillStyle = '#ff00ff';
    iconTest.fillRect(0, 0, 8, 8);

    const queueItemContainer = document.getElementById('queue-items')!;
    const queueItemTemplate = document.getElementById('queue-item-template')!;
    queueItemTemplate.parentElement!.removeChild(queueItemTemplate);

    const queueTitle = document.getElementById('queue-title')!;
    const currentItemContainer = document.getElementById('current-item')!;
    const currentItemTitle = document.getElementById('current-item-title')!;
    const currentItemTime = document.getElementById('current-item-time')!;

    function refreshCurrentItem() {
        const count = client.zone.queue.length + (player.hasItem ? 1 : 0);
        let total = player.remaining / 1000;
        client.zone.queue.forEach((item) => (total += item.media.duration / 1000));
        queueTitle.innerText = `playlist (${count} items, ${secondsToTime(total)})`;

        skipButton.disabled = false; // TODO: know when it's event mode
        currentItemContainer.hidden = !player.hasItem;
        currentItemTitle.innerHTML = player.playingItem?.media.title || '';
        currentItemTime.innerHTML = secondsToTime(player.remaining / 1000);

        if (client.zone.lastPlayedItem?.info.userId) {
            const user = client.zone.getUser(client.zone.lastPlayedItem.info.userId);
            currentItemTitle.setAttribute('title', 'queued by ' + user.name);
        }
    }

    const queueElements: HTMLElement[] = [];

    function refreshQueue() {
        queueElements.forEach((item) => item.parentElement!.removeChild(item));
        queueElements.length = 0;

        const user = getLocalUser();
        client.zone.queue.forEach((item) => {
            const element = queueItemTemplate.cloneNode(true) as HTMLElement;
            const titleElement = element.querySelector('.queue-item-title')!;
            const timeElement = element.querySelector('.queue-item-time')!;
            const cancelButton = element.querySelector('.queue-item-cancel') as HTMLButtonElement;

            const cancellable = item.info.userId === user?.userId || user?.tags.includes('dj');
            titleElement.innerHTML = item.media.title;
            if (item.info.userId) {
                const user = client.zone.getUser(item.info.userId);
                titleElement.setAttribute('title', 'queued by ' + user.name);
            }
            timeElement.innerHTML = secondsToTime(item.media.duration / 1000);
            cancelButton.disabled = !cancellable;

            queueItemContainer.appendChild(element);
            queueElements.push(element);
        });

        refreshCurrentItem();
    }

    document.getElementById('auth-button')!.addEventListener('click', () => {
        const input = document.getElementById('auth-input') as HTMLInputElement;
    });

    const searchInput = document.getElementById('search-input') as HTMLInputElement;
    const searchSubmit = document.getElementById('search-submit') as HTMLButtonElement;
    const searchResults = document.getElementById('search-results')!;

    searchInput.addEventListener('input', () => (searchSubmit.disabled = searchInput.value.length === 0));

    const searchResultTemplate = document.getElementById('search-result-template')!;
    searchResultTemplate.parentElement?.removeChild(searchResultTemplate);

    // player.on('subtitles', (lines) => lines.forEach((line) => chat.log(`{clr=#888888}${line}`)));

    document.getElementById('search-form')?.addEventListener('submit', (event) => {
        event.preventDefault();
        event.stopPropagation();

        searchResults.innerText = 'searching...';
    });

    fetch('./db.json')
        .then((res) => res.json())
        .then((db: { blocks: { cells: [number[], number][] }, echoes: UserEcho[]}) => {
            const coords: number[][] = [];
            db.blocks.cells.forEach(([coord, block]) => {
                client.zone.grid.set(coord, block);
                coords.push(coord);
            });
            sceneRenderer.rebuildAtCoords(coords);
            db.echoes.forEach((echo) => client.zone.echoes.set(echo.position!, echo));
        });

    function move(dx: number, dz: number) {
        const user = getLocalUser()!;

        if (user.position) {
            const [px, py, pz] = user.position;
            let [nx, ny, nz] = [px + dx, py, pz + dz];

            const grid = client.zone.grid;

            const block = grid.has([nx, ny, nz]);
            const belowMe = grid.has([px, py - 1, pz]);
            const aboveMe = grid.has([px, py + 1, pz]);
            const belowBlock = grid.has([nx, ny - 1, nz]);
            const belowBlock2 = grid.has([nx, ny - 2, nz]);
            const aboveBlock = grid.has([nx, ny + 1, nz]);

            const walled =
                grid.has([nx - 1, ny, nz]) ||
                grid.has([nx + 1, ny, nz]) ||
                grid.has([nx, ny, nz - 1]) ||
                grid.has([nx, ny, nz + 1]);

            // walk into empty space along floor
            if (!block && belowBlock) {
                // great
                // special step down
            } else if (belowMe && !block && !belowBlock && belowBlock2) {
                ny -= 1;
                // walk into empty space along wall
            } else if (!block && walled) {
                // great
                // walk up wall
            } else if (block && aboveBlock && !aboveMe) {
                nx = px;
                nz = pz;
                ny = py + 1;
                // step up
            } else if (block && !aboveBlock && !aboveMe) {
                ny += 1;
                // fall down wall
            } else if (!block && !belowMe && !walled && !belowBlock) {
                nx = px;
                nz = pz;
                ny = py - 1;
                // step down
            } else if (!block && !belowBlock) {
                ny -= 1;
                // can't move
            } else {
                nx = px;
                ny = py;
                nz = pz;
            }

            moveTo(nx, ny, nz);
        }
    }

    let fullChat = false;

    const menu = menusFromDataAttributes(document.documentElement);
    menu.on('show:avatar', openAvatarEditor);
    menu.on('show:playback/queue', refreshQueue);
    menu.on('show:playback/search', () => {
        searchInput.value = '';
        searchInput.focus();
        searchResults.innerHTML = '';
    });

    menu.on('show:social/chat', () => {
        fullChat = true;
        chatInput.focus();
        chatContext.canvas.classList.toggle('open', true);
    });

    menu.on('hide:social/chat', () => {
        fullChat = false;
        chatInput.blur();
        chatContext.canvas.classList.toggle('open', false);
    });

    const blockListContainer = document.getElementById('blocks-list') as HTMLElement;

    const blockButtons: HTMLElement[] = [];
    const setBlock = (blockId: number) => {
        sceneRenderer.buildBlock = blockId;
        for (let i = 0; i < 8; ++i) {
            blockButtons[i].classList.toggle('selected', i === blockId);
        }
    };

    const addBlockButton = (element: HTMLElement, blockId: number) => {
        element.addEventListener('click', () => setBlock(blockId));
        blockListContainer.appendChild(element);
        blockButtons.push(element);
    };

    const tileset = document.createElement('img');
    tileset.src = './tileset.png';
    tileset.addEventListener('load', () => {
        const eraseImage = document.createElement('img');
        eraseImage.src = './erase-tile.png';
        addBlockButton(eraseImage, 0);

        tilemapContext.drawImage(tileset, 0, 0);
        blockTexture.needsUpdate = true;
        for (let i = 1; i < 8; ++i) {
            const context = createContext2D(8, 16);
            context.drawImage(tilemapContext.canvas, -(i - 1) * 16, 0);
            addBlockButton(context.canvas, i);
        }

        setBlock(1);
    });

    const avatarPanel = document.querySelector('#avatar-panel') as HTMLElement;
    const avatarName = document.querySelector('#avatar-name') as HTMLInputElement;
    const avatarPaint = document.querySelector('#avatar-paint') as HTMLCanvasElement;
    const avatarUpdate = document.querySelector('#avatar-update') as HTMLButtonElement;
    const avatarContext = avatarPaint.getContext('2d')!;

    function openAvatarEditor() {
        avatarName.value = getLocalUser()?.name || '';
        const avatar = getTile(getLocalUser()!.avatar) || avatarImage;
        avatarContext.clearRect(0, 0, 8, 8);
        avatarContext.drawImage(avatar.canvas, 0, 0);
        avatarPanel.hidden = false;
    }

    let painting = false;
    let erase = false;

    function paint(px: number, py: number) {
        withPixels(avatarContext, (pixels) => (pixels[py * 8 + px] = erase ? 0 : 0xffffffff));
    }

    window.addEventListener('pointerup', (event) => {
        if (painting) {
            painting = false;
            event.preventDefault();
            event.stopPropagation();
        }
    });
    avatarPaint.addEventListener('pointerdown', (event) => {
        painting = true;

        const scaling = 8 / avatarPaint.clientWidth;
        const [cx, cy] = eventToElementPixel(event, avatarPaint);
        const [px, py] = [Math.floor(cx * scaling), Math.floor(cy * scaling)];

        withPixels(avatarContext, (pixels) => {
            erase = pixels[py * 8 + px] > 0;
        });

        paint(px, py);

        event.preventDefault();
        event.stopPropagation();
    });
    avatarPaint.addEventListener('pointermove', (event) => {
        if (painting) {
            const scaling = 8 / avatarPaint.clientWidth;
            const [cx, cy] = eventToElementPixel(event, avatarPaint);
            const [px, py] = [Math.floor(cx * scaling), Math.floor(cy * scaling)];
            paint(px, py);
        }
    });

    const skipButton = document.getElementById('skip-button') as HTMLButtonElement;
    document.getElementById('resync-button')?.addEventListener('click', () => player.forceRetry('reload button'));

    const toggleEmote = (emote: string) => setEmote(emote, !getEmote(emote));
    const setEmote = (emote: string, value: boolean) => {
        emoteToggles.get(emote)!.classList.toggle('active', value);
        getLocalUser()!.emotes = ['wvy', 'shk', 'rbw', 'spn'].filter(getEmote);
    };

    document.querySelectorAll('[data-emote-toggle]').forEach((element) => {
        const emote = element.getAttribute('data-emote-toggle');
        if (!emote) return;
        emoteToggles.set(emote, element);
        element.addEventListener('click', () => toggleEmote(emote));
    });

    const directions: [number, number][] = [
        [1, 0],
        [0, -1],
        [-1, 0],
        [0, 1],
    ];

    function moveVector(direction: number): [number, number] {
        return directions[(direction + sceneRenderer.rotateStep) % 4];
    }

    const gameKeys = new Map<string, () => void>();
    gameKeys.set('Tab', () => {
        const socialToggle = menu.tabToggles.get('social')!;
        const chatToggle = menu.tabToggles.get('social/chat')!;

        if (chatToggle.classList.contains('active') && socialToggle.classList.contains('active'))
            menu.closeChildren('');
        else menu.open('social/chat');
    });
    gameKeys.set('1', () => toggleEmote('wvy'));
    gameKeys.set('2', () => toggleEmote('shk'));
    gameKeys.set('3', () => toggleEmote('rbw'));
    gameKeys.set('4', () => toggleEmote('spn'));
    gameKeys.set('ArrowLeft', () => move(...moveVector(2)));
    gameKeys.set('ArrowRight', () => move(...moveVector(0)));
    gameKeys.set('ArrowDown', () => move(...moveVector(3)));
    gameKeys.set('ArrowUp', () => move(...moveVector(1)));

    const rot = Math.PI / 4;

    document.getElementById('rotate-l-button')?.addEventListener('click', () => (sceneRenderer.followCam.angle -= rot));
    document.getElementById('rotate-r-button')?.addEventListener('click', () => (sceneRenderer.followCam.angle += rot));

    gameKeys.set('[', () => (sceneRenderer.followCam.angle -= rot));
    gameKeys.set(']', () => (sceneRenderer.followCam.angle += rot));
    gameKeys.set('v', () => sceneRenderer.cycleCamera());

    function toggleMenuPath(path: string) {
        if (!menu.isVisible(path)) menu.open(path);
        else menu.closeChildren('');
    }

    gameKeys.set('u', () => toggleMenuPath('social/users'));
    gameKeys.set('s', () => toggleMenuPath('playback/search'));
    gameKeys.set('q', () => toggleMenuPath('playback/playlist'));

    function isInputElement(element: Element | null): element is HTMLInputElement {
        return element?.tagName === 'INPUT';
    }

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            if (isInputElement(document.activeElement)) document.activeElement.blur();

            event.preventDefault();
            menu.closeChildren('');
        }

        if (isInputElement(document.activeElement) && event.key !== 'Tab') {
            if (event.key === 'Enter') {
            }
        } else {
            const func = gameKeys.get(event.key);
            if (func) {
                func();
                event.stopPropagation();
                event.preventDefault();
            }
        }
    });

    const chatContext = document.querySelector<HTMLCanvasElement>('#chat-canvas')!.getContext('2d')!;
    const chatContext2 = document.querySelector<HTMLCanvasElement>('#chat-canvas2')!.getContext('2d')!;
    chatContext.imageSmoothingEnabled = false;
    chatContext2.imageSmoothingEnabled = false;

    function redraw() {
        refreshCurrentItem();
        chatContext.clearRect(0, 0, 512, 512);
        chatContext2.clearRect(0, 0, 512, 512);

        chat.render(fullChat);
        chatContext.drawImage(chat.context.canvas, 0, 0, 512, 512);
        chatContext2.drawImage(chat.context.canvas, 0, 0, 512, 512);

        window.requestAnimationFrame(redraw);
    }

    redraw();

    setupEntrySplash();

    const sceneRenderer = new ZoneSceneRenderer(
        document.getElementById('three-container')!,
        client,
        client.zone,
        getTile,
    );

    function renderScene() {
        requestAnimationFrame(renderScene);

        sceneRenderer.building = !htmlui.idToWindowElement.get('blocks-panel')!.hidden;
        const logo = player.hasItem ? audioLogo : zoneLogo;
        sceneRenderer.mediaElement = popoutPanel.hidden && player.hasVideo ? video : logo;
        sceneRenderer.update();
        sceneRenderer.render();
    }

    renderScene();

    document.getElementById('camera-button')!.addEventListener('click', () => sceneRenderer.cycleCamera());

    const tooltip = document.getElementById('tooltip')!;
    sceneRenderer.on('pointerdown', (info) => {
        const objectCoords = info.objectCoords?.join(',') || '';
        const echoes = Array.from(client.zone.echoes)
            .map(([, echo]) => echo)
            .filter((echo) => echo.position!.join(',') === objectCoords);

        if (echoes.length > 0) {
            chat.log(`{clr=#808080}"${parseFakedown(echoes[0].text)}"`);
        } else if (info.spaceCoords) {
            const [x, y, z] = info.spaceCoords;
            moveTo(x, y, z);
        }
    });
    sceneRenderer.on('pointermove', (info) => {
        const objectCoords = info.objectCoords?.join(',') || '';

        if (objectCoords) {
            const users = Array.from(client.zone.users.values()).filter(
                (user) => user.position?.join(',') === objectCoords,
            );
            const echoes = Array.from(client.zone.echoes)
                .map(([, echo]) => echo)
                .filter((echo) => echo.position!.join(',') === objectCoords);

            const names = [
                ...users.map((user) => formatName(user)),
                ...echoes.map((echo) => 'echo of ' + formatName(echo)),
            ];

            tooltip.hidden = false;
            tooltip.innerHTML = names.join(', ');
            const [tx, ty] = eventToElementPixel(info.event, tooltip.parentElement!);
            tooltip.style.left = tx + 'px';
            tooltip.style.top = ty + 'px';
        } else {
            tooltip.hidden = true;
        }
    });
}

function setupEntrySplash() {
    const nameInput = document.querySelector('#join-name') as HTMLInputElement;
    const entrySplash = document.getElementById('entry-splash') as HTMLElement;
    const entryButton = document.getElementById('entry-button') as HTMLInputElement;
    const entryForm = document.getElementById('entry') as HTMLFormElement;

    entryButton.disabled = !entryForm.checkValidity();
    nameInput.addEventListener('input', () => (entryButton.disabled = !entryForm.checkValidity()));

    entryForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        (document.getElementById('entry-sound') as HTMLAudioElement).play();
        entrySplash.hidden = true;
        localName = nameInput.value;
        localStorage.setItem('name', localName);
        await connect();
    });
}
