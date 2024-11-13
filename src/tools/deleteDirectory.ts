import * as fs from "fs/promises"
import * as path from "path"

export async function deleteDirectory(dirPath: string): Promise<void> {
    // Resolve the directory path to an absolute path for safer operation
    const fullPath = path.resolve(dirPath)

    try {
        await fs.rm(fullPath, { recursive: true, force: true })
        console.log(`Directory deleted successfully: ${fullPath}`)
    } catch (err) {
        console.error(`Error deleting directory: ${err}`)
        throw err // Re-throw to allow caller to handle the error
    }
}
