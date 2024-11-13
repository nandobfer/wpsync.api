export declare type WithoutFunctions<T> = {
    [P in keyof T as T[P] extends Function ? never : P]: T[P]
}

export declare interface FileUpload {
    file?: ArrayBuffer | File
    mimetype?: string
    base64?: string
    name: string
}

export type Diff<T extends keyof any, U extends keyof any> = {
    [P in T]: P extends U ? never : P
}[T]

export type PickDiff<T, U> = Pick<T, Diff<keyof T, keyof U>>

type Primitive = string | boolean | number | null

export type FilterPrimitive<T> = {
    [P in keyof T as T[P] extends Primitive ? P : never]: T[P]
}