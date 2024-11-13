import express, { Express, Request, Response } from "express"
import { Washima, WashimaForm } from "../../class/Washima/Washima"
import { prisma } from "../../prisma"
import { getIoInstance } from "../../io/socket"
import tools from "./tools"
import { User } from "../../class/User"

const router = express.Router()

router.use("/tools", tools)

router.get("/", async (request: Request, response: Response) => {
    const washima_id = request.query.washima_id as string | undefined
    const user_id = request.query.user_id as string | undefined

    if (washima_id) {
        try {
            const washima = Washima.find(washima_id)
            response.json(washima)
        } catch (error) {
            console.log(error)
            response.status(500).send(error)
        }
    } else {
        if (user_id) {
            const user = await User.findById(user_id)
            if (user) {
                const washimas = user.admin
                    ? Washima.washimas
                    : Washima.washimas.filter((washima) => washima.users.find((user) => user.id === user_id))
                response.json(washimas)
            } else {
                response.status(404).send("user not found")
            }
        }
    }
})

router.post("/", async (request: Request, response: Response) => {
    const data = request.body as WashimaForm

    try {
        const washima = await Washima.new(data)
        response.json(washima)

        const io = getIoInstance()
        io.emit("washima:update", washima)

        await washima.initialize()
        await washima.fetchAndSaveAllMessages()
    } catch (error) {
        console.log(error)
        response.status(500).send(error)
    }
})

router.patch("/", async (request: Request, response: Response) => {
    const data = request.body as Partial<Washima> & { id: string }

    try {
        const washima = Washima.find(data.id)
        await washima?.update(data)
        response.json(washima)
    } catch (error) {
        console.log(error)
        response.status(500).send(error)
    }
})

router.delete("/", async (request: Request, response: Response) => {
    const data = request.body as { washima_id: string }

    try {
        const deleted = await Washima.delete(data.washima_id)
        response.json(deleted)
        const io = getIoInstance()
        io.emit("washima:delete", deleted)
    } catch (error) {
        console.log(error)
        response.status(500).send(error)
    }
})

router.get("/profile-pic", async (request: Request, response: Response) => {
    const washima_id = request.query.washima_id as string | undefined
    const chat_id = request.query.chat_id as string | undefined
    const message_id = request.query.message_id as string | undefined

    if (washima_id) {
        try {
            const washima = Washima.find(washima_id)
            if (washima) {
                const picture = await washima.getContactPicture(
                    message_id || chat_id || washima.client.info.wid._serialized,
                    message_id ? "message" : "chat"
                )
                response.json(picture)
            }
        } catch (error) {
            console.log(error)
            response.status(500).send(error)
        }
    } else {
        response.status(400).send("washima_id param is required")
    }
})

router.get("/chat", async (request: Request, response: Response) => {
    const washima_id = request.query.washima_id as string | undefined
    const chat_id = request.query.chat_id as string | undefined
    const is_group = request.query.is_group as string | undefined
    const offset = request.query.offset as string | undefined
    const take = request.query.take as string | undefined

    if (washima_id) {
        const washima = Washima.find(washima_id)
        if (washima) {
            if (chat_id) {
                try {
                    const chat = await washima.buildChat(chat_id, Number(offset || 0), !!is_group)
                    response.json(chat)
                } catch (error) {
                    console.log(error)
                    response.status(500).send(error)
                }
            } else {
                try {
                    console.log(offset, take)
                    const chats = washima.chats
                        .sort((a, b) => b.lastMessage?.timestamp - a.lastMessage?.timestamp)
                        .slice(Number(offset || 0), Number(offset || 0) + Number(take || 0))
                    response.json(chats)
                } catch (error) {
                    console.log(error)
                    response.status(500).send(error)
                }
            }
        }
    } else {
        response.status(400).send("washima_id param is required")
    }
})

router.get("/media", async (request: Request, response: Response) => {
    const washima_id = request.query.washima_id as string | undefined
    const message_id = request.query.message_id as string | undefined

    if (washima_id && message_id) {
        try {
            const washima = Washima.find(washima_id)
            if (washima) {
                const message = await washima.getMessage(message_id)
                const media = await washima.getMedia(message)
                if (media) {
                    response.setHeader("Content-Type", media.mimetype)
                    response.setHeader("Content-Disposition", `inline; filename=${media.filename || "media"}`)
                    const mediaBuffer = Buffer.from(media.data, "base64")
                    response.send(mediaBuffer)
                } else {
                    response.status(404).send("Media not found")
                }
            }
        } catch (error) {
            console.log(error)
            response.status(500).send(error)
        }
    } else {
        response.status(400).send("washima_id and message_id params are required")
    }
})

router.get("/media-metadata", async (request: Request, response: Response) => {
    const washima_id = request.query.washima_id as string | undefined
    const message_id = request.query.message_id as string | undefined

    if (washima_id && message_id) {
        try {
            const washima = Washima.find(washima_id)
            if (washima) {
                const media_data = await washima.getMediaMeta(message_id)
                response.json(media_data)
            }
        } catch (error) {
            console.log(error)
            response.status(500).send(error)
        }
    } else {
        response.status(400).send("washima_id and message_id params are required")
    }
})

router.post("/restart", async (request: Request, response: Response) => {
    const data = request.body as { washima_id: string }

    try {
        const washima = Washima.find(data.washima_id)
        await washima?.restart()
        response.json(washima)
    } catch (error) {
        console.log(error)
        response.status(500).send(error)
    }
})

router.post("/fetch-messages-whatsappweb", async (request: Request, response: Response) => {
    const data = request.body as { id: string; options?: { groupOnly?: boolean } }

    try {
        const washima = Washima.find(data.id)
        if (washima) {
            const messages = await washima.fetchAndSaveAllMessages(data.options)
            response.json(messages)
            return
        }

        response.send(null)
    } catch (error) {
        console.log(error)
        response.status(500).send(error)
    }
})

router.get("/search", async (request: Request, response: Response) => {
    const washima_id = request.query.washima_id as string | undefined
    const search = request.query.search as string | undefined

    if (washima_id) {
        try {
            const washima = Washima.find(washima_id)
            if (washima) {
                const result = await washima.search(search || "")
                response.json(result)
            }
        } catch (error) {
            console.log(error)
            response.status(500).send(error)
        }
    } else {
        response.status(400).send("washima_id param is required")
    }
})

export default router
