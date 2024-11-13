import express, { Express, Request, Response } from "express"
import { Washima } from "../../class/Washima/Washima"
import { WashimaMessage } from "../../class/Washima/WashimaMessage"
const router = express.Router()

router.get("/disk-usage", async (request: Request, response: Response) => {
    const washima_id = request.query.washima_id as string | undefined

    if (washima_id) {
        try {
            const washima = await Washima.query(washima_id)
            const disk_usage = await washima.getDiskUsage()
            response.json(disk_usage)
        } catch (error) {
            console.log(error)
            response.status(500).send(error)
        }
    } else {
        response.status(400).send("washima_id param is required")
    }
})

router.delete("/media", async (request: Request, response: Response) => {
    const data = request.body as { washima_id: string }

    try {
        const washima = await Washima.query(data.washima_id)
        const deletion_count = await washima.clearMedia()
        response.json(deletion_count)
    } catch (error) {
        console.log(error)
        response.status(500).send(error)
    }
})

router.delete("/messages", async (request: Request, response: Response) => {
    const data = request.body as { washima_id: string }

    try {
        const washima = await Washima.query(data.washima_id)
        const deletion_count = await washima.clearMessages()
        response.json(deletion_count)
    } catch (error) {
        console.log(error)
        response.status(500).send(error)
    }
})

router.get("/copy-chat", async (request: Request, response: Response) => {
    const chat_id = request.query.chat_id as string | undefined

    if (chat_id) {
        try {
            const messages = await WashimaMessage.getChatMessages(chat_id, 0, null)
            response.json(messages)
        } catch (error) {
            console.log(error)
            response.status(500).send(error)
        }
    } else {
        response.status(400).send("chat_id param is required")
    }
})

export default router
