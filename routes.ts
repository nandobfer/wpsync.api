import express, { Express, Request, Response } from "express"
import nagazap from "./src/rest/nagazap/nagazap"
import washima from "./src/rest/washima/washima"
import user from "./src/rest/user/user"
import { version } from "./src/version"

export const router = express.Router()

router.get("/", (request, response) => {
    response.json({ version })
})

router.use("/nagazap", nagazap)
router.use("/washima", washima)
router.use("/user", user)
