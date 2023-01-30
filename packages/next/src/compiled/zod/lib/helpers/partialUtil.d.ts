import type { ZodArray, ZodNullable, ZodObject, ZodOptional, ZodTuple, ZodTupleItems, ZodTypeAny } from "../index";
export declare namespace partialUtil {
    type DeepPartial<T extends ZodTypeAny> = T extends ZodObject<infer Shape, infer Params, infer Catchall> ? ZodObject<{
        [k in keyof Shape]: ZodOptional<DeepPartial<Shape[k]>>;
    }, Params, Catchall> : T extends ZodArray<infer Type, infer Card> ? ZodArray<DeepPartial<Type>, Card> : T extends ZodOptional<infer Type> ? ZodOptional<DeepPartial<Type>> : T extends ZodNullable<infer Type> ? ZodNullable<DeepPartial<Type>> : T extends ZodTuple<infer Items> ? {
        [k in keyof Items]: Items[k] extends ZodTypeAny ? DeepPartial<Items[k]> : never;
    } extends infer PI ? PI extends ZodTupleItems ? ZodTuple<PI> : never : never : T;
}
