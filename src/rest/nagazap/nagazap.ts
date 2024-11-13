import express, { Express, Request, Response } from "express"
import { OvenForm, WhatsappApiForm, WhatsappForm, WhatsappTemplateComponent } from "../../types/shared/Meta/WhatsappBusiness/WhatsappForm"
import { addMessageToStack, api as zapApi } from "../../api/whatsapp/meta"
import { AxiosError } from "axios"
import { MessageWebhook } from "../../types/shared/Meta/WhatsappBusiness/MessageWebhook"
import { Nagazap, NagazapForm } from "../../class/Nagazap"
import { UploadedFile } from "express-fileupload"
import { saveFile } from "../../tools/saveFile"
import { HandledError } from "../../class/HandledError"
import { requireNagazapId } from "../../middlewares/requireNagazapId"
import webhook from "./webhook"
import { TemplateForm } from "../../types/shared/Meta/WhatsappBusiness/TemplatesInfo"
import stats from "./stats"

const router = express.Router()

export const getNumbers = (original_number: string | number) => {
    const number = `55${original_number}@c.us`

    const prefix = number.slice(2, 4)
    const number2 = `55${prefix + number.slice(5)}`
    return [number, number2]
}

router.use("/webhook", webhook)
router.use("/stats", stats)

router.get("/", async (request: Request, response: Response) => {
    const user_id = request.query.user_id as string | undefined
    const nagazap_id = request.query.nagazap_id as string | undefined

    console.log(user_id)
    if (user_id) {
        if (nagazap_id) {
            const nagazap = await Nagazap.getById(Number(nagazap_id))
            response.json(nagazap)
        } else {
            try {
                const nagazaps = await Nagazap.getByUserId(user_id)
                response.json(nagazaps)
            } catch (error) {
                console.log(error)
                response.status(500).send(error)
            }
        }
    } else {
        response.status(400).send("user_id param is required")
    }
})

router.post("/", async (request: Request, response: Response) => {
    const data = request.body as NagazapForm

    try {
        const nagazap = await Nagazap.new(data)
        response.json(nagazap)
    } catch (error) {
        console.log(error)
        response.status(error instanceof HandledError ? 400 : 500).send(error)
    }
})

router.use(requireNagazapId) // require the "nagazap_id" param for all routes bellow

router.patch("/", async (request: Request, response: Response) => {
    const nagazap_id = request.query.nagazap_id as string
    const data = request.body as { batchSize?: number; frequency?: string }

    try {
        const nagazap = await Nagazap.getById(Number(nagazap_id))
        await nagazap.updateOvenSettings(data)
        response.json(nagazap)
    } catch (error) {
        console.log(error)
        response.status(500).send(error)
    }
})

router.delete("/", async (request: Request, response: Response) => {
    const nagazap_id = request.query.nagazap_id as string

    try {
        const deleted = await Nagazap.delete(Number(nagazap_id))
        response.json(deleted)
    } catch (error) {
        console.log(error)
        response.status(500).send(error)
    }
})

router.get("/info", async (request: Request, response: Response) => {
    const nagazap_id = request.query.nagazap_id as string
    try {
        const nagazap = await Nagazap.getById(Number(nagazap_id))
        const info = await nagazap.getInfo()
        if (info) {
            return response.json(info)
        } else {
            response.status(400).send("Não foi possível obter as informações, verifique seu Token")
        }
    } catch (error) {
        response.status(500).send(error)
        if (error instanceof AxiosError) {
            console.log(error.response?.data)
        } else {
            console.log(error)
        }
    }
})

router.get("/pause", async (request: Request, response: Response) => {
    const nagazap_id = request.query.nagazap_id as string
    try {
        const nagazap = await Nagazap.getById(Number(nagazap_id))
        await nagazap.pause()
        response.json(nagazap)
    } catch (error) {
        console.log(error)
        response.status(500).send(error)
    }
})

router.get("/start", async (request: Request, response: Response) => {
    const nagazap_id = request.query.nagazap_id as string
    try {
        const nagazap = await Nagazap.getById(Number(nagazap_id))
        await nagazap.start()
        response.json(nagazap)
    } catch (error) {
        console.log(error)
        response.status(500).send(error)
    }
})

router.get("/clearOven", async (request: Request, response: Response) => {
    const nagazap_id = request.query.nagazap_id as string
    try {
        const nagazap = await Nagazap.getById(Number(nagazap_id))
        await nagazap.clearOven()
        response.json(nagazap)
    } catch (error) {
        console.log(error)
        response.status(500).send(error)
    }
})

router.delete("/blacklist", async (request: Request, response: Response) => {
    const nagazap_id = request.query.nagazap_id as string
    const data = request.body as { number: string }

    try {
        const nagazap = await Nagazap.getById(Number(nagazap_id))
        await nagazap.removeFromBlacklist(data.number)
        response.json(nagazap)
    } catch (error) {
        console.log(error)
        response.status(500).send(error)
    }
})

router.patch("/token", async (request: Request, response: Response) => {
    const nagazap_id = request.query.nagazap_id as string
    const data = request.body as { token: string }
    if (data.token) {
        try {
            const nagazap = await Nagazap.getById(Number(nagazap_id))
            await nagazap.updateToken(data.token)
            response.json(nagazap)
        } catch (error) {
            console.log(error)
            response.status(500).send(error)
        }
    } else {
        response.status(400).send("missing token attribute")
    }
})

router.get("/messages", async (request: Request, response: Response) => {
    const nagazap_id = request.query.nagazap_id as string
    try {
        const nagazap = await Nagazap.getById(Number(nagazap_id))
        const messages = await nagazap.getMessages()
        response.json(messages)
    } catch (error) {
        console.log(error)
        response.status(500).send(error)
    }
})

router.get("/templates", async (request: Request, response: Response) => {
    const nagazap_id = request.query.nagazap_id as string
    try {
        const nagazap = await Nagazap.getById(Number(nagazap_id))
        const templates = await nagazap.getTemplates()
        response.json(templates)
    } catch (error) {
        response.status(500).send(error)
        if (error instanceof AxiosError) {
            console.log(error.response?.data)
        } else {
            console.log(error)
        }
    }
})

router.post("/template", async (request: Request, response: Response) => {
    const nagazap_id = request.query.nagazap_id as string

    try {
        const data = JSON.parse(request.body.data) as TemplateForm
        console.log(data)

        const nagazap = await Nagazap.getById(Number(nagazap_id))

        if (request.files) {
            const file = request.files.file as UploadedFile
            file.name = file.name.replace(/[\s\/\\?%*:|"<>]+/g, "-").trim()
            const media_handler = await nagazap.uploadTemplateMedia(file)
            data.components.forEach((component, index) => {
                if (component.type === "HEADER") {
                    data.components[index].example = { header_handle: [media_handler.h] }
                }
            })
        }

        const template_response = await nagazap.createTemplate(data)
        response.json(template_response)
    } catch (error) {
        if (error instanceof AxiosError && error.response?.status === 400) {
            console.log(error.response.data)
            return response
                .status(400)
                .send(
                    error.response.data.error.message || `${error.response.data.error.error_user_title}. ${error.response.data.error.error_user_msg}`
                )
        }
        console.log(error)
        response.status(500).send(error)
    }
})

router.post("/oven", async (request: Request, response: Response) => {
    const nagazap_id = request.query.nagazap_id as string
    try {
        const nagazap = await Nagazap.getById(Number(nagazap_id))
        let image_id = ""

        const data = JSON.parse(request.body.data) as OvenForm
        console.log(`quantidade de contatos: ${data.to.length}`)
        if (!data.template) {
            response.status(400).send("template is required")
            return
        }

        if (request.files) {
            const file = request.files.file as UploadedFile
            file.name = file.name.replace(/[\s\/\\?%*:|"<>]+/g, "-").trim()
            const uploaded = saveFile("nagazap/image", { name: file.name, file: file.data }, async () => {
                image_id = await nagazap.uploadMedia(file, uploaded.filepath)
                await nagazap.prepareBatch(data, image_id)
                response.send("teste")
            })
        } else {
            await nagazap.prepareBatch(data, image_id)
            response.send("teste")
        }
    } catch (error) {
        console.log(error)
        if (error instanceof AxiosError) {
            console.log(error.response?.data)
        }
        response.status(500).send(error)
    }
})

// // router.post("/", async (request: Request, response: Response) => {
// //     const data = request.body as WhatsappForm

// //     try {
// //         const new_message_index = addMessageToStack(data)
// //         console.log({ queued_message_number: data.number, template: data.template, new_message_index })
// //         response.json(new_message_index)
// //     } catch (error) {
// //         if (error instanceof AxiosError) {
// //             console.log(error.response?.data)
// //         } else {
// //             console.log(error)
// //         }
// //         response.status(500).send(error)
// //     }
// // })

export default router
