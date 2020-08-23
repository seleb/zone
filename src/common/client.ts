import { ZoneState, UserState, QueueItem, UserEcho } from './zone';

export type StatusMesage = { text: string };
export type JoinMessage = { name: string; token?: string; password?: string };
export type AssignMessage = { userId: string; token: string };
export type RejectMessage = { text: string };
export type UsersMessage = { users: UserState[] };
export type LeaveMessage = { userId: string };
export type PlayMessage = { item: QueueItem; time: number };
export type QueueMessage = { items: QueueItem[] };
export type UnqueueMessage = { itemId: number };

export type SendChat = { text: string };
export type RecvChat = { text: string; userId: string };

export type SendAuth = { password: string };
export type SendCommand = { name: string; args: any[] };

export type BlocksMessage = { cells: [number[], number][] };
export type BlockMessage = { coords: number[]; value: number };

export type EchoMessage = { position: number[]; text: string };
export type EchoesMessage = { added?: UserEcho[]; removed?: number[][] };

export type DataMessage = { update: any };

export interface MessageMap {
    heartbeat: {};
    assign: AssignMessage;
    reject: RejectMessage;
    users: UsersMessage;
    leave: LeaveMessage;
    play: PlayMessage;
    queue: QueueMessage;

    chat: SendChat;
    user: UserState;

    block: BlockMessage;
    blocks: BlocksMessage;
    echoes: EchoesMessage;
}

export interface ClientOptions {
    urlRoot: string;
    quickResponseTimeout: number;
    slowResponseTimeout: number;
    joinName?: string;
}

export const DEFAULT_OPTIONS: ClientOptions = {
    urlRoot: '.',
    quickResponseTimeout: 3000,
    slowResponseTimeout: 5000,
};

export interface ClientEventMap {
    disconnect: (event: { clean: boolean }) => void;
    joined: (event: { user: UserState }) => void;

    chat: (event: { user: UserState; text: string; local: boolean }) => void;
    join: (event: { user: UserState }) => void;
    leave: (event: { user: UserState }) => void;
    rename: (event: { user: UserState; previous: string; local: boolean }) => void;
    status: (event: { text: string }) => void;
    users: (event: {}) => void;

    play: (event: { message: PlayMessage }) => void;
    queue: (event: { item: QueueItem }) => void;
    unqueue: (event: { item: QueueItem }) => void;

    move: (event: { user: UserState; position: number[]; local: boolean }) => void;
    emotes: (event: { user: UserState; emotes: string[]; local: boolean }) => void;
    avatar: (event: { user: UserState; data: string; local: boolean }) => void;
    tags: (event: { user: UserState; tags: string[]; local: boolean }) => void;

    blocks: (event: { coords: number[][] }) => void;
}

export class ZoneClient {
    readonly zone = new ZoneState();

    localUser?: UserState;

    get localUserId() {
        return "0";
    }

    clear() {
        this.zone.clear();
    }
}

export default ZoneClient;
