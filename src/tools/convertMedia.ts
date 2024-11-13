import { join, parse } from "path"
import { FileUpload } from "../class/helpers"
import ffmpeg from "fluent-ffmpeg"
import { readFileSync, writeFileSync } from "fs"
import { file } from "tmp-promise"

export interface ConvertFileOptions {
    file?: ArrayBuffer
    base64?: string
    original_path?: string
    output_format: string
    input_format?: string
    returnBase64?: boolean
    customArgs?: string[]
}

export const convertFile = (data: ConvertFileOptions): Promise<Buffer | string> => {
    return new Promise(async (resolve, reject) => {
        const input_file = await file()
        const output_file = await file({ postfix: `.${data.output_format}` })
        const cleanup = async () => {
            input_file.cleanup()
            output_file.cleanup()
        }

        try {
            if (data.base64) {
                writeFileSync(input_file.path, Buffer.from(data.base64, "base64"))
            } else if (data.file) {
                writeFileSync(input_file.path, Buffer.from(data.file as ArrayBuffer))
            }
            const inputPath = data.original_path || input_file.path
            const { name, ext } = parse(inputPath)
            if (!data.input_format || ext.toLowerCase() === data.input_format) {
                const ffmpegCommand = ffmpeg(inputPath)

                if (data.customArgs && data.customArgs.length) {
                    ffmpegCommand.inputOptions(data.customArgs) // You could also use .outputOptions if more appropriate
                }

                ffmpegCommand
                    .toFormat(data.output_format)
                    .on("end", () => {
                        const buffer = readFileSync(output_file.path)
                        resolve(data.returnBase64 ? buffer.toString("base64") : buffer)
                        cleanup()
                    })
                    .on("error", (err) => {
                        console.error("Error during conversion:", err)
                        reject(err)
                        cleanup()
                    })
                    .save(output_file.path)
            } else {
                await cleanup()
                reject(new Error(`Input format does not match or is not specified: Expected ${data.input_format} got ${ext}`))
            }
        } catch (err) {
            reject(err)
            await cleanup()
        }
    })
}
