import { Socket } from "socket.io"
import { Server as SocketIoServer } from "socket.io"
import { Server as HttpServer } from "http"
import { Server as HttpsServer } from "https"
import { Washima, WashimaMediaForm } from "../class/Washima/Washima"

let io: SocketIoServer | null = null

export const initializeIoServer = (server: HttpServer | HttpsServer) => {
    io = new SocketIoServer(server, {
        cors: { origin: "*" },
        maxHttpBufferSize: 1e8,
    })
}

export const getIoInstance = () => {
    if (!io) {
        throw new Error("Socket.IO has not been initialized. Please call initializeIoServer first.")
    }
    return io
}



export const handleSocket = (socket: Socket) => {
    console.log(`new connection: ${socket.id}`)

    socket.on("disconnect", async (reason) => {
        console.log(`disconnected: ${socket.id}`)
        console.log({ reason })
    })

    socket.on("washima:message", (washima_id: string, chat_id: string, message?: string, media?: WashimaMediaForm) =>
        Washima.sendMessage(socket, washima_id, chat_id, message, media)
    )
    socket.on("washima:message:contact", (washima_id: string, contact_id: string, message_id: string) =>
        Washima.getContact(socket, washima_id, contact_id, message_id)
    )




}
