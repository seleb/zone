import { EventEmitter, once } from 'events';

export type Message = { type: string; [key: string]: any };
export type MessageEvent = { data: any };

export interface Socket {
    readyState: number;
    send(data: string): void;
    close(code?: number, reason?: string): void;

    addEventListener(event: string, listener: (event: any) => void): void;
    removeEventListener(event: string, listener: (event: any) => void): void;
}

export interface Messaging {
    on(event: 'close', callback: (code: number) => void): this;
    on(event: 'error', callback: (error: any) => void): this;
}

export class Messaging extends EventEmitter {
    readonly messages = new EventEmitter();
    private socket?: Socket;
    private closeListener = (event: any) => this.emit('close', event.code || event);

    setSocket(socket: Socket) {
        if (this.socket) {
            this.socket.removeEventListener('close', this.closeListener);
            this.socket.close();
        }

        this.socket = socket;
        this.socket.addEventListener('close', this.closeListener);
        this.socket.addEventListener('message', (event: MessageEvent) => {
            const { type, ...message } = JSON.parse(event.data) as Message;
            this.messages.emit(type, message);
        });
    }

    async close(code = 1000) {
        if (!this.socket || this.socket.readyState === 3) return;
        const waiter = once(this, 'close');
        this.socket.close(code);
        await waiter;
    }

    send(type: string, message: object = {}) {
        if (!this.socket) {
            this.emit('error', new Error('no socket'));
            return;
        } else if (this.socket.readyState !== 1) {
            this.emit('error', new Error('socket not open'));
            return;
        }

        const data = JSON.stringify({ type, ...message });

        try {
            this.socket.send(data);
        } catch (e) {
            this.emit('error', e);
        }
    }
}

export default Messaging;
