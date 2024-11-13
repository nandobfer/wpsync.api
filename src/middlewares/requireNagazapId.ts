import { NextFunction, Request, Response } from "express"

export const requireNagazapId = (request: Request, response: Response, next: NextFunction) => {
    const { nagazap_id } = request.query

    if (!nagazap_id) {
        return response.status(400).send("nagazap_id param is required")
    }

    next()
}
