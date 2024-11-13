import express, { Express, Request, Response } from "express"
import { MessageWebhook } from "../../types/shared/Meta/WhatsappBusiness/MessageWebhook"
import { NagaMessageType, Nagazap } from "../../class/Nagazap"
const router = express.Router()

router.get("/messages", async (request: Request, response: Response) => {
    const mode = request.query["hub.mode"]

    if (mode == "subscribe") {
        try {
            const challenge = request.query["hub.challenge"]

            response.status(200).send(challenge)
        } catch (error) {
            console.log(error)
            response.status(500).send(error)
        }
    } else {
        response.status(400).send("hub.mode should be subscribe")
    }
})

router.post("/messages", async (request: Request, response: Response) => {
    try {
        const data = request.body as MessageWebhook
        console.log(data)
        const businessId = data.entry[0].id
        const nagazap = await Nagazap.getByBusinessId(businessId)
        data.entry?.forEach(async (entry) => {
            entry.changes?.forEach(async (change) => {
                if (change.field !== "messages") return
                change.value.messages?.forEach(async (message) => {
                    console.log(message)
                    const data_types: { type: NagaMessageType; data?: string }[] = [
                        { type: "audio", data: message.audio?.id },
                        { type: "image", data: message.image?.id },
                        { type: "reaction", data: message.reaction?.emoji },
                        { type: "sticker", data: message.sticker?.id },
                        { type: "text", data: message.text?.body },
                        { type: "video", data: message.video?.id },
                        { type: "button", data: message.button?.text },
                    ]
                    const data = data_types.find((item) => item.type === message.type)
                    if (data && data.data) {
                        if (data.type !== "text" && data.type !== "button" && data.type !== "reaction") {
                            const media_url = await nagazap.downloadMedia(data.data)
                            data.data = media_url
                        }
                    }

                    nagazap.saveMessage({
                        from: message.from.slice(2),
                        text: data?.data || "**EM DESENVOLVIMENTO**",
                        timestamp: message.timestamp,
                        name: change.value.contacts[0].profile?.name || "",
                        type: message.type,
                    })
                })
            })
        })
        response.status(200).send()
    } catch (error) {
        console.log(error)
        response.status(500).send(error)
    }
})

router.get("/media", async (request: Request, response: Response) => {
    const mode = request.query["hub.mode"]

    if (mode == "subscribe") {
        try {
            const challenge = request.query["hub.challenge"]

            response.status(200).send(challenge)
        } catch (error) {
            console.log(error)
            response.status(500).send(error)
        }
    } else {
        response.status(400).send("hub.mode should be subscribe")
    }
})

router.post("/media", async (request: Request, response: Response) => {
    const data = request.body

    try {
        console.log(JSON.stringify(data, null, 4))
        response.status(200).send()
    } catch (error) {
        console.log(error)
        response.status(500).send(error)
    }
})

export default router
