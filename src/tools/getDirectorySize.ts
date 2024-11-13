import * as fs from "fs/promises"
import * as path from "path"

export async function getDirectorySize(dirPath: string): Promise<number> {
    // Resolve the directory path to an absolute path for safer operation
    const fullPath = path.resolve(dirPath)

    // Check if the directory exists before proceeding
    try {
        const stat = await fs.stat(fullPath)
        if (!stat.isDirectory()) {
            return 0 // or throw an error if you prefer
        }
    } catch (err: unknown) {
        if (typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "ENOENT") {
            return 0
        }
        throw err // Re-throw other errors to be handled by the caller
    }

    // Recursive function to calculate total size of directory contents
    async function calculateSize(directory: string): Promise<number> {
        const entries = await fs.readdir(directory, { withFileTypes: true, recursive: true })
        const results = await Promise.all(
            entries.map((entry) => {
                const resolvedPath = path.resolve(directory, entry.name)
                if (entry.isDirectory()) {
                    return calculateSize(resolvedPath) // Recursively calculate for directories
                } else {
                    return fs.stat(resolvedPath).then((stat) => stat.size)
                }
            })
        )
        return results.reduce((acc, size) => acc + size, 0) // Sum file sizes
    }

    const totalSize = await calculateSize(fullPath)
    const totalSizeInMB = totalSize // Convert bytes to megabytes
    return totalSizeInMB
}
