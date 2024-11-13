import { WithoutFunctions } from "./helpers"

export enum HandledErrorCode {
    nagazap_not_found = 1,
    nagazap_no_info = 2,
}

export class HandledError {
    text: string
    code: HandledErrorCode

    constructor(data: WithoutFunctions<HandledError>) {
        this.text = data.text
        this.code = data.code
    }
}
