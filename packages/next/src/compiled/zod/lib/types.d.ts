import { enumUtil } from "./helpers/enumUtil";
import { errorUtil } from "./helpers/errorUtil";
import { AsyncParseReturnType, ParseContext, ParseInput, ParseParams, ParseReturnType, ParseStatus, SyncParseReturnType } from "./helpers/parseUtil";
import { partialUtil } from "./helpers/partialUtil";
import { Primitive } from "./helpers/typeAliases";
import { util } from "./helpers/util";
import { IssueData, StringValidation, ZodCustomIssue, ZodError, ZodErrorMap } from "./ZodError";
export declare type RefinementCtx = {
    addIssue: (arg: IssueData) => void;
    path: (string | number)[];
};
export declare type ZodRawShape = {
    [k: string]: ZodTypeAny;
};
export declare type ZodTypeAny = ZodType<any, any, any>;
export declare type TypeOf<T extends ZodType<any, any, any>> = T["_output"];
export declare type input<T extends ZodType<any, any, any>> = T["_input"];
export declare type output<T extends ZodType<any, any, any>> = T["_output"];
export type { TypeOf as infer };
export declare type CustomErrorParams = Partial<util.Omit<ZodCustomIssue, "code">>;
export interface ZodTypeDef {
    errorMap?: ZodErrorMap;
    description?: string;
}
export declare type RawCreateParams = {
    errorMap?: ZodErrorMap;
    invalid_type_error?: string;
    required_error?: string;
    description?: string;
} | undefined;
export declare type ProcessedCreateParams = {
    errorMap?: ZodErrorMap;
    description?: string;
};
export declare type SafeParseSuccess<Output> = {
    success: true;
    data: Output;
};
export declare type SafeParseError<Input> = {
    success: false;
    error: ZodError<Input>;
};
export declare type SafeParseReturnType<Input, Output> = SafeParseSuccess<Output> | SafeParseError<Input>;
export declare abstract class ZodType<Output = any, Def extends ZodTypeDef = ZodTypeDef, Input = Output> {
    readonly _type: Output;
    readonly _output: Output;
    readonly _input: Input;
    readonly _def: Def;
    get description(): string | undefined;
    abstract _parse(input: ParseInput): ParseReturnType<Output>;
    _getType(input: ParseInput): string;
    _getOrReturnCtx(input: ParseInput, ctx?: ParseContext | undefined): ParseContext;
    _processInputParams(input: ParseInput): {
        status: ParseStatus;
        ctx: ParseContext;
    };
    _parseSync(input: ParseInput): SyncParseReturnType<Output>;
    _parseAsync(input: ParseInput): AsyncParseReturnType<Output>;
    parse(data: unknown, params?: Partial<ParseParams>): Output;
    safeParse(data: unknown, params?: Partial<ParseParams>): SafeParseReturnType<Input, Output>;
    parseAsync(data: unknown, params?: Partial<ParseParams>): Promise<Output>;
    safeParseAsync(data: unknown, params?: Partial<ParseParams>): Promise<SafeParseReturnType<Input, Output>>;
    /** Alias of safeParseAsync */
    spa: (data: unknown, params?: Partial<ParseParams> | undefined) => Promise<SafeParseReturnType<Input, Output>>;
    refine<RefinedOutput extends Output>(check: (arg: Output) => arg is RefinedOutput, message?: string | CustomErrorParams | ((arg: Output) => CustomErrorParams)): ZodEffects<this, RefinedOutput, Input>;
    refine(check: (arg: Output) => unknown | Promise<unknown>, message?: string | CustomErrorParams | ((arg: Output) => CustomErrorParams)): ZodEffects<this, Output, Input>;
    refinement<RefinedOutput extends Output>(check: (arg: Output) => arg is RefinedOutput, refinementData: IssueData | ((arg: Output, ctx: RefinementCtx) => IssueData)): ZodEffects<this, RefinedOutput, Input>;
    refinement(check: (arg: Output) => boolean, refinementData: IssueData | ((arg: Output, ctx: RefinementCtx) => IssueData)): ZodEffects<this, Output, Input>;
    _refinement(refinement: RefinementEffect<Output>["refinement"]): ZodEffects<this, Output, Input>;
    superRefine<RefinedOutput extends Output>(refinement: (arg: Output, ctx: RefinementCtx) => arg is RefinedOutput): ZodEffects<this, RefinedOutput, Input>;
    superRefine(refinement: (arg: Output, ctx: RefinementCtx) => void): ZodEffects<this, Output, Input>;
    constructor(def: Def);
    optional(): ZodOptional<this>;
    nullable(): ZodNullable<this>;
    nullish(): ZodNullable<ZodOptional<this>>;
    array(): ZodArray<this>;
    promise(): ZodPromise<this>;
    or<T extends ZodTypeAny>(option: T): ZodUnion<[this, T]>;
    and<T extends ZodTypeAny>(incoming: T): ZodIntersection<this, T>;
    transform<NewOut>(transform: (arg: Output, ctx: RefinementCtx) => NewOut | Promise<NewOut>): ZodEffects<this, NewOut>;
    default(def: util.noUndefined<Input>): ZodDefault<this>;
    default(def: () => util.noUndefined<Input>): ZodDefault<this>;
    brand<B extends string | number | symbol>(brand?: B): ZodBranded<this, B>;
    catch(def: Input): ZodCatch<this>;
    catch(def: () => Input): ZodCatch<this>;
    describe(description: string): this;
    pipe<T extends ZodTypeAny>(target: T): ZodPipeline<this, T>;
    isOptional(): boolean;
    isNullable(): boolean;
}
export declare type ZodStringCheck = {
    kind: "min";
    value: number;
    message?: string;
} | {
    kind: "max";
    value: number;
    message?: string;
} | {
    kind: "length";
    value: number;
    message?: string;
} | {
    kind: "email";
    message?: string;
} | {
    kind: "url";
    message?: string;
} | {
    kind: "uuid";
    message?: string;
} | {
    kind: "cuid";
    message?: string;
} | {
    kind: "startsWith";
    value: string;
    message?: string;
} | {
    kind: "endsWith";
    value: string;
    message?: string;
} | {
    kind: "regex";
    regex: RegExp;
    message?: string;
} | {
    kind: "trim";
    message?: string;
} | {
    kind: "datetime";
    offset: boolean;
    precision: number | null;
    message?: string;
};
export interface ZodStringDef extends ZodTypeDef {
    checks: ZodStringCheck[];
    typeName: ZodFirstPartyTypeKind.ZodString;
    coerce: boolean;
}
export declare class ZodString extends ZodType<string, ZodStringDef> {
    _parse(input: ParseInput): ParseReturnType<string>;
    protected _regex: (regex: RegExp, validation: StringValidation, message?: errorUtil.ErrMessage | undefined) => ZodEffects<this, string, string>;
    _addCheck(check: ZodStringCheck): ZodString;
    email(message?: errorUtil.ErrMessage): ZodString;
    url(message?: errorUtil.ErrMessage): ZodString;
    uuid(message?: errorUtil.ErrMessage): ZodString;
    cuid(message?: errorUtil.ErrMessage): ZodString;
    datetime(options?: string | {
        message?: string | undefined;
        precision?: number | null;
        offset?: boolean;
    }): ZodString;
    regex(regex: RegExp, message?: errorUtil.ErrMessage): ZodString;
    startsWith(value: string, message?: errorUtil.ErrMessage): ZodString;
    endsWith(value: string, message?: errorUtil.ErrMessage): ZodString;
    min(minLength: number, message?: errorUtil.ErrMessage): ZodString;
    max(maxLength: number, message?: errorUtil.ErrMessage): ZodString;
    length(len: number, message?: errorUtil.ErrMessage): ZodString;
    /**
     * @deprecated Use z.string().min(1) instead.
     * @see {@link ZodString.min}
     */
    nonempty: (message?: errorUtil.ErrMessage | undefined) => ZodString;
    trim: () => ZodString;
    get isDatetime(): boolean;
    get isEmail(): boolean;
    get isURL(): boolean;
    get isUUID(): boolean;
    get isCUID(): boolean;
    get minLength(): number | null;
    get maxLength(): number | null;
    static create: (params?: ({
        errorMap?: ZodErrorMap | undefined;
        invalid_type_error?: string | undefined;
        required_error?: string | undefined;
        description?: string | undefined;
    } & {
        coerce?: true | undefined;
    }) | undefined) => ZodString;
}
export declare type ZodNumberCheck = {
    kind: "min";
    value: number;
    inclusive: boolean;
    message?: string;
} | {
    kind: "max";
    value: number;
    inclusive: boolean;
    message?: string;
} | {
    kind: "int";
    message?: string;
} | {
    kind: "multipleOf";
    value: number;
    message?: string;
} | {
    kind: "finite";
    message?: string;
};
export interface ZodNumberDef extends ZodTypeDef {
    checks: ZodNumberCheck[];
    typeName: ZodFirstPartyTypeKind.ZodNumber;
    coerce: boolean;
}
export declare class ZodNumber extends ZodType<number, ZodNumberDef> {
    _parse(input: ParseInput): ParseReturnType<number>;
    static create: (params?: ({
        errorMap?: ZodErrorMap | undefined;
        invalid_type_error?: string | undefined;
        required_error?: string | undefined;
        description?: string | undefined;
    } & {
        coerce?: boolean | undefined;
    }) | undefined) => ZodNumber;
    gte(value: number, message?: errorUtil.ErrMessage): ZodNumber;
    min: (value: number, message?: errorUtil.ErrMessage | undefined) => ZodNumber;
    gt(value: number, message?: errorUtil.ErrMessage): ZodNumber;
    lte(value: number, message?: errorUtil.ErrMessage): ZodNumber;
    max: (value: number, message?: errorUtil.ErrMessage | undefined) => ZodNumber;
    lt(value: number, message?: errorUtil.ErrMessage): ZodNumber;
    protected setLimit(kind: "min" | "max", value: number, inclusive: boolean, message?: string): ZodNumber;
    _addCheck(check: ZodNumberCheck): ZodNumber;
    int(message?: errorUtil.ErrMessage): ZodNumber;
    positive(message?: errorUtil.ErrMessage): ZodNumber;
    negative(message?: errorUtil.ErrMessage): ZodNumber;
    nonpositive(message?: errorUtil.ErrMessage): ZodNumber;
    nonnegative(message?: errorUtil.ErrMessage): ZodNumber;
    multipleOf(value: number, message?: errorUtil.ErrMessage): ZodNumber;
    finite(message?: errorUtil.ErrMessage): ZodNumber;
    step: (value: number, message?: errorUtil.ErrMessage | undefined) => ZodNumber;
    get minValue(): number | null;
    get maxValue(): number | null;
    get isInt(): boolean;
}
export interface ZodBigIntDef extends ZodTypeDef {
    typeName: ZodFirstPartyTypeKind.ZodBigInt;
    coerce: boolean;
}
export declare class ZodBigInt extends ZodType<bigint, ZodBigIntDef> {
    _parse(input: ParseInput): ParseReturnType<bigint>;
    static create: (params?: ({
        errorMap?: ZodErrorMap | undefined;
        invalid_type_error?: string | undefined;
        required_error?: string | undefined;
        description?: string | undefined;
    } & {
        coerce?: boolean | undefined;
    }) | undefined) => ZodBigInt;
}
export interface ZodBooleanDef extends ZodTypeDef {
    typeName: ZodFirstPartyTypeKind.ZodBoolean;
    coerce: boolean;
}
export declare class ZodBoolean extends ZodType<boolean, ZodBooleanDef> {
    _parse(input: ParseInput): ParseReturnType<boolean>;
    static create: (params?: ({
        errorMap?: ZodErrorMap | undefined;
        invalid_type_error?: string | undefined;
        required_error?: string | undefined;
        description?: string | undefined;
    } & {
        coerce?: boolean | undefined;
    }) | undefined) => ZodBoolean;
}
export declare type ZodDateCheck = {
    kind: "min";
    value: number;
    message?: string;
} | {
    kind: "max";
    value: number;
    message?: string;
};
export interface ZodDateDef extends ZodTypeDef {
    checks: ZodDateCheck[];
    coerce: boolean;
    typeName: ZodFirstPartyTypeKind.ZodDate;
}
export declare class ZodDate extends ZodType<Date, ZodDateDef> {
    _parse(input: ParseInput): ParseReturnType<this["_output"]>;
    _addCheck(check: ZodDateCheck): ZodDate;
    min(minDate: Date, message?: errorUtil.ErrMessage): ZodDate;
    max(maxDate: Date, message?: errorUtil.ErrMessage): ZodDate;
    get minDate(): Date | null;
    get maxDate(): Date | null;
    static create: (params?: ({
        errorMap?: ZodErrorMap | undefined;
        invalid_type_error?: string | undefined;
        required_error?: string | undefined;
        description?: string | undefined;
    } & {
        coerce?: boolean | undefined;
    }) | undefined) => ZodDate;
}
export interface ZodSymbolDef extends ZodTypeDef {
    typeName: ZodFirstPartyTypeKind.ZodSymbol;
}
export declare class ZodSymbol extends ZodType<symbol, ZodSymbolDef, symbol> {
    _parse(input: ParseInput): ParseReturnType<this["_output"]>;
    static create: (params?: RawCreateParams) => ZodSymbol;
}
export interface ZodUndefinedDef extends ZodTypeDef {
    typeName: ZodFirstPartyTypeKind.ZodUndefined;
}
export declare class ZodUndefined extends ZodType<undefined, ZodUndefinedDef> {
    _parse(input: ParseInput): ParseReturnType<this["_output"]>;
    params?: RawCreateParams;
    static create: (params?: RawCreateParams) => ZodUndefined;
}
export interface ZodNullDef extends ZodTypeDef {
    typeName: ZodFirstPartyTypeKind.ZodNull;
}
export declare class ZodNull extends ZodType<null, ZodNullDef> {
    _parse(input: ParseInput): ParseReturnType<this["_output"]>;
    static create: (params?: RawCreateParams) => ZodNull;
}
export interface ZodAnyDef extends ZodTypeDef {
    typeName: ZodFirstPartyTypeKind.ZodAny;
}
export declare class ZodAny extends ZodType<any, ZodAnyDef> {
    _any: true;
    _parse(input: ParseInput): ParseReturnType<this["_output"]>;
    static create: (params?: RawCreateParams) => ZodAny;
}
export interface ZodUnknownDef extends ZodTypeDef {
    typeName: ZodFirstPartyTypeKind.ZodUnknown;
}
export declare class ZodUnknown extends ZodType<unknown, ZodUnknownDef> {
    _unknown: true;
    _parse(input: ParseInput): ParseReturnType<this["_output"]>;
    static create: (params?: RawCreateParams) => ZodUnknown;
}
export interface ZodNeverDef extends ZodTypeDef {
    typeName: ZodFirstPartyTypeKind.ZodNever;
}
export declare class ZodNever extends ZodType<never, ZodNeverDef> {
    _parse(input: ParseInput): ParseReturnType<this["_output"]>;
    static create: (params?: RawCreateParams) => ZodNever;
}
export interface ZodVoidDef extends ZodTypeDef {
    typeName: ZodFirstPartyTypeKind.ZodVoid;
}
export declare class ZodVoid extends ZodType<void, ZodVoidDef> {
    _parse(input: ParseInput): ParseReturnType<this["_output"]>;
    static create: (params?: RawCreateParams) => ZodVoid;
}
export interface ZodArrayDef<T extends ZodTypeAny = ZodTypeAny> extends ZodTypeDef {
    type: T;
    typeName: ZodFirstPartyTypeKind.ZodArray;
    exactLength: {
        value: number;
        message?: string;
    } | null;
    minLength: {
        value: number;
        message?: string;
    } | null;
    maxLength: {
        value: number;
        message?: string;
    } | null;
}
export declare type ArrayCardinality = "many" | "atleastone";
export declare type arrayOutputType<T extends ZodTypeAny, Cardinality extends ArrayCardinality = "many"> = Cardinality extends "atleastone" ? [T["_output"], ...T["_output"][]] : T["_output"][];
export declare class ZodArray<T extends ZodTypeAny, Cardinality extends ArrayCardinality = "many"> extends ZodType<arrayOutputType<T, Cardinality>, ZodArrayDef<T>, Cardinality extends "atleastone" ? [T["_input"], ...T["_input"][]] : T["_input"][]> {
    _parse(input: ParseInput): ParseReturnType<this["_output"]>;
    get element(): T;
    min(minLength: number, message?: errorUtil.ErrMessage): this;
    max(maxLength: number, message?: errorUtil.ErrMessage): this;
    length(len: number, message?: errorUtil.ErrMessage): this;
    nonempty(message?: errorUtil.ErrMessage): ZodArray<T, "atleastone">;
    static create: <T_1 extends ZodTypeAny>(schema: T_1, params?: RawCreateParams) => ZodArray<T_1, "many">;
}
export declare type ZodNonEmptyArray<T extends ZodTypeAny> = ZodArray<T, "atleastone">;
export declare namespace objectUtil {
    export type MergeShapes<U extends ZodRawShape, V extends ZodRawShape> = {
        [k in Exclude<keyof U, keyof V>]: U[k];
    } & V;
    type optionalKeys<T extends object> = {
        [k in keyof T]: undefined extends T[k] ? k : never;
    }[keyof T];
    type requiredKeys<T extends object> = {
        [k in keyof T]: undefined extends T[k] ? never : k;
    }[keyof T];
    export type addQuestionMarks<T extends object> = Partial<Pick<T, optionalKeys<T>>> & Pick<T, requiredKeys<T>>;
    export type identity<T> = T;
    export type flatten<T extends object> = identity<{
        [k in keyof T]: T[k];
    }>;
    export type noNeverKeys<T extends ZodRawShape> = {
        [k in keyof T]: [T[k]] extends [never] ? never : k;
    }[keyof T];
    export type noNever<T extends ZodRawShape> = identity<{
        [k in noNeverKeys<T>]: k extends keyof T ? T[k] : never;
    }>;
    export const mergeShapes: <U extends ZodRawShape, T extends ZodRawShape>(first: U, second: T) => T & U;
    export {};
}
export declare type extendShape<A, B> = Omit<A, keyof B> & B;
export declare type UnknownKeysParam = "passthrough" | "strict" | "strip";
export interface ZodObjectDef<T extends ZodRawShape = ZodRawShape, UnknownKeys extends UnknownKeysParam = UnknownKeysParam, Catchall extends ZodTypeAny = ZodTypeAny> extends ZodTypeDef {
    typeName: ZodFirstPartyTypeKind.ZodObject;
    shape: () => T;
    catchall: Catchall;
    unknownKeys: UnknownKeys;
}
export declare type baseObjectOutputType<Shape extends ZodRawShape> = objectUtil.flatten<objectUtil.addQuestionMarks<{
    [k in keyof Shape]: Shape[k]["_output"];
}>>;
export declare type objectOutputType<Shape extends ZodRawShape, Catchall extends ZodTypeAny> = ZodTypeAny extends Catchall ? baseObjectOutputType<Shape> : objectUtil.flatten<baseObjectOutputType<Shape> & {
    [k: string]: Catchall["_output"];
}>;
export declare type baseObjectInputType<Shape extends ZodRawShape> = objectUtil.flatten<objectUtil.addQuestionMarks<{
    [k in keyof Shape]: Shape[k]["_input"];
}>>;
export declare type objectInputType<Shape extends ZodRawShape, Catchall extends ZodTypeAny> = ZodTypeAny extends Catchall ? baseObjectInputType<Shape> : objectUtil.flatten<baseObjectInputType<Shape> & {
    [k: string]: Catchall["_input"];
}>;
export declare type deoptional<T extends ZodTypeAny> = T extends ZodOptional<infer U> ? deoptional<U> : T extends ZodNullable<infer U> ? ZodNullable<deoptional<U>> : T;
export declare type SomeZodObject = ZodObject<ZodRawShape, UnknownKeysParam, ZodTypeAny, any, any>;
export declare class ZodObject<T extends ZodRawShape, UnknownKeys extends UnknownKeysParam = "strip", Catchall extends ZodTypeAny = ZodTypeAny, Output = objectOutputType<T, Catchall>, Input = objectInputType<T, Catchall>> extends ZodType<Output, ZodObjectDef<T, UnknownKeys, Catchall>, Input> {
    private _cached;
    _getCached(): {
        shape: T;
        keys: string[];
    };
    _parse(input: ParseInput): ParseReturnType<this["_output"]>;
    get shape(): T;
    strict(message?: errorUtil.ErrMessage): ZodObject<T, "strict", Catchall>;
    strip(): ZodObject<T, "strip", Catchall>;
    passthrough(): ZodObject<T, "passthrough", Catchall>;
    /**
     * @deprecated In most cases, this is no longer needed - unknown properties are now silently stripped.
     * If you want to pass through unknown properties, use `.passthrough()` instead.
     */
    nonstrict: () => ZodObject<T, "passthrough", Catchall>;
    augment: <Augmentation extends ZodRawShape>(augmentation: Augmentation) => ZodObject<extendShape<T, Augmentation>, UnknownKeys, Catchall, objectOutputType<extendShape<T, Augmentation>, Catchall>, objectInputType<extendShape<T, Augmentation>, Catchall>>;
    extend: <Augmentation extends ZodRawShape>(augmentation: Augmentation) => ZodObject<extendShape<T, Augmentation>, UnknownKeys, Catchall, objectOutputType<extendShape<T, Augmentation>, Catchall>, objectInputType<extendShape<T, Augmentation>, Catchall>>;
    setKey<Key extends string, Schema extends ZodTypeAny>(key: Key, schema: Schema): ZodObject<T & {
        [k in Key]: Schema;
    }, UnknownKeys, Catchall>;
    /**
     * Prior to zod@1.0.12 there was a bug in the
     * inferred type of merged objects. Please
     * upgrade if you are experiencing issues.
     */
    merge<Incoming extends AnyZodObject>(merging: Incoming): ZodObject<extendShape<T, ReturnType<Incoming["_def"]["shape"]>>, Incoming["_def"]["unknownKeys"], Incoming["_def"]["catchall"]>;
    catchall<Index extends ZodTypeAny>(index: Index): ZodObject<T, UnknownKeys, Index>;
    pick<Mask extends {
        [k in keyof T]?: true;
    }>(mask: Mask): ZodObject<Pick<T, Extract<keyof T, keyof Mask>>, UnknownKeys, Catchall>;
    omit<Mask extends {
        [k in keyof T]?: true;
    }>(mask: Mask): ZodObject<Omit<T, keyof Mask>, UnknownKeys, Catchall>;
    deepPartial(): partialUtil.DeepPartial<this>;
    partial(): ZodObject<{
        [k in keyof T]: ZodOptional<T[k]>;
    }, UnknownKeys, Catchall>;
    partial<Mask extends {
        [k in keyof T]?: true;
    }>(mask: Mask): ZodObject<objectUtil.noNever<{
        [k in keyof T]: k extends keyof Mask ? ZodOptional<T[k]> : T[k];
    }>, UnknownKeys, Catchall>;
    required(): ZodObject<{
        [k in keyof T]: deoptional<T[k]>;
    }, UnknownKeys, Catchall>;
    required<Mask extends {
        [k in keyof T]?: true;
    }>(mask: Mask): ZodObject<objectUtil.noNever<{
        [k in keyof T]: k extends keyof Mask ? deoptional<T[k]> : T[k];
    }>, UnknownKeys, Catchall>;
    keyof(): ZodEnum<enumUtil.UnionToTupleString<keyof T>>;
    static create: <T_1 extends ZodRawShape>(shape: T_1, params?: RawCreateParams) => ZodObject<T_1, "strip", ZodTypeAny, { [k_1 in keyof objectUtil.addQuestionMarks<{ [k in keyof T_1]: T_1[k]["_output"]; }>]: objectUtil.addQuestionMarks<{ [k in keyof T_1]: T_1[k]["_output"]; }>[k_1]; }, { [k_3 in keyof objectUtil.addQuestionMarks<{ [k_2 in keyof T_1]: T_1[k_2]["_input"]; }>]: objectUtil.addQuestionMarks<{ [k_2 in keyof T_1]: T_1[k_2]["_input"]; }>[k_3]; }>;
    static strictCreate: <T_1 extends ZodRawShape>(shape: T_1, params?: RawCreateParams) => ZodObject<T_1, "strict", ZodTypeAny, { [k_1 in keyof objectUtil.addQuestionMarks<{ [k in keyof T_1]: T_1[k]["_output"]; }>]: objectUtil.addQuestionMarks<{ [k in keyof T_1]: T_1[k]["_output"]; }>[k_1]; }, { [k_3 in keyof objectUtil.addQuestionMarks<{ [k_2 in keyof T_1]: T_1[k_2]["_input"]; }>]: objectUtil.addQuestionMarks<{ [k_2 in keyof T_1]: T_1[k_2]["_input"]; }>[k_3]; }>;
    static lazycreate: <T_1 extends ZodRawShape>(shape: () => T_1, params?: RawCreateParams) => ZodObject<T_1, "strip", ZodTypeAny, { [k_1 in keyof objectUtil.addQuestionMarks<{ [k in keyof T_1]: T_1[k]["_output"]; }>]: objectUtil.addQuestionMarks<{ [k in keyof T_1]: T_1[k]["_output"]; }>[k_1]; }, { [k_3 in keyof objectUtil.addQuestionMarks<{ [k_2 in keyof T_1]: T_1[k_2]["_input"]; }>]: objectUtil.addQuestionMarks<{ [k_2 in keyof T_1]: T_1[k_2]["_input"]; }>[k_3]; }>;
}
export declare type AnyZodObject = ZodObject<any, any, any>;
export declare type ZodUnionOptions = Readonly<[ZodTypeAny, ...ZodTypeAny[]]>;
export interface ZodUnionDef<T extends ZodUnionOptions = Readonly<[
    ZodTypeAny,
    ZodTypeAny,
    ...ZodTypeAny[]
]>> extends ZodTypeDef {
    options: T;
    typeName: ZodFirstPartyTypeKind.ZodUnion;
}
export declare class ZodUnion<T extends ZodUnionOptions> extends ZodType<T[number]["_output"], ZodUnionDef<T>, T[number]["_input"]> {
    _parse(input: ParseInput): ParseReturnType<this["_output"]>;
    get options(): T;
    static create: <T_1 extends readonly [ZodTypeAny, ZodTypeAny, ...ZodTypeAny[]]>(types: T_1, params?: RawCreateParams) => ZodUnion<T_1>;
}
export declare type ZodDiscriminatedUnionOption<Discriminator extends string> = ZodObject<{
    [key in Discriminator]: ZodTypeAny;
} & ZodRawShape, any, any>;
export interface ZodDiscriminatedUnionDef<Discriminator extends string, Options extends ZodDiscriminatedUnionOption<any>[] = ZodDiscriminatedUnionOption<any>[]> extends ZodTypeDef {
    discriminator: Discriminator;
    options: Options;
    optionsMap: Map<Primitive, ZodDiscriminatedUnionOption<any>>;
    typeName: ZodFirstPartyTypeKind.ZodDiscriminatedUnion;
}
export declare class ZodDiscriminatedUnion<Discriminator extends string, Options extends ZodDiscriminatedUnionOption<Discriminator>[]> extends ZodType<output<Options[number]>, ZodDiscriminatedUnionDef<Discriminator, Options>, input<Options[number]>> {
    _parse(input: ParseInput): ParseReturnType<this["_output"]>;
    get discriminator(): Discriminator;
    get options(): Options;
    get optionsMap(): Map<Primitive, ZodDiscriminatedUnionOption<any>>;
    /**
     * The constructor of the discriminated union schema. Its behaviour is very similar to that of the normal z.union() constructor.
     * However, it only allows a union of objects, all of which need to share a discriminator property. This property must
     * have a different value for each object in the union.
     * @param discriminator the name of the discriminator property
     * @param types an array of object schemas
     * @param params
     */
    static create<Discriminator extends string, Types extends [
        ZodDiscriminatedUnionOption<Discriminator>,
        ...ZodDiscriminatedUnionOption<Discriminator>[]
    ]>(discriminator: Discriminator, options: Types, params?: RawCreateParams): ZodDiscriminatedUnion<Discriminator, Types>;
}
export interface ZodIntersectionDef<T extends ZodTypeAny = ZodTypeAny, U extends ZodTypeAny = ZodTypeAny> extends ZodTypeDef {
    left: T;
    right: U;
    typeName: ZodFirstPartyTypeKind.ZodIntersection;
}
export declare class ZodIntersection<T extends ZodTypeAny, U extends ZodTypeAny> extends ZodType<T["_output"] & U["_output"], ZodIntersectionDef<T, U>, T["_input"] & U["_input"]> {
    _parse(input: ParseInput): ParseReturnType<this["_output"]>;
    static create: <T_1 extends ZodTypeAny, U_1 extends ZodTypeAny>(left: T_1, right: U_1, params?: RawCreateParams) => ZodIntersection<T_1, U_1>;
}
export declare type ZodTupleItems = [ZodTypeAny, ...ZodTypeAny[]];
export declare type AssertArray<T> = T extends any[] ? T : never;
export declare type OutputTypeOfTuple<T extends ZodTupleItems | []> = AssertArray<{
    [k in keyof T]: T[k] extends ZodType<any, any> ? T[k]["_output"] : never;
}>;
export declare type OutputTypeOfTupleWithRest<T extends ZodTupleItems | [], Rest extends ZodTypeAny | null = null> = Rest extends ZodTypeAny ? [...OutputTypeOfTuple<T>, ...Rest["_output"][]] : OutputTypeOfTuple<T>;
export declare type InputTypeOfTuple<T extends ZodTupleItems | []> = AssertArray<{
    [k in keyof T]: T[k] extends ZodType<any, any> ? T[k]["_input"] : never;
}>;
export declare type InputTypeOfTupleWithRest<T extends ZodTupleItems | [], Rest extends ZodTypeAny | null = null> = Rest extends ZodTypeAny ? [...InputTypeOfTuple<T>, ...Rest["_input"][]] : InputTypeOfTuple<T>;
export interface ZodTupleDef<T extends ZodTupleItems | [] = ZodTupleItems, Rest extends ZodTypeAny | null = null> extends ZodTypeDef {
    items: T;
    rest: Rest;
    typeName: ZodFirstPartyTypeKind.ZodTuple;
}
export declare type AnyZodTuple = ZodTuple<[
    ZodTypeAny,
    ...ZodTypeAny[]
] | [], ZodTypeAny | null>;
export declare class ZodTuple<T extends [ZodTypeAny, ...ZodTypeAny[]] | [] = [ZodTypeAny, ...ZodTypeAny[]], Rest extends ZodTypeAny | null = null> extends ZodType<OutputTypeOfTupleWithRest<T, Rest>, ZodTupleDef<T, Rest>, InputTypeOfTupleWithRest<T, Rest>> {
    _parse(input: ParseInput): ParseReturnType<this["_output"]>;
    get items(): T;
    rest<Rest extends ZodTypeAny>(rest: Rest): ZodTuple<T, Rest>;
    static create: <T_1 extends [] | [ZodTypeAny, ...ZodTypeAny[]]>(schemas: T_1, params?: RawCreateParams) => ZodTuple<T_1, null>;
}
export interface ZodRecordDef<Key extends KeySchema = ZodString, Value extends ZodTypeAny = ZodTypeAny> extends ZodTypeDef {
    valueType: Value;
    keyType: Key;
    typeName: ZodFirstPartyTypeKind.ZodRecord;
}
export declare type KeySchema = ZodType<string | number | symbol, any, any>;
export declare type RecordType<K extends string | number | symbol, V> = [
    string
] extends [K] ? Record<K, V> : [number] extends [K] ? Record<K, V> : [symbol] extends [K] ? Record<K, V> : Partial<Record<K, V>>;
export declare class ZodRecord<Key extends KeySchema = ZodString, Value extends ZodTypeAny = ZodTypeAny> extends ZodType<RecordType<Key["_output"], Value["_output"]>, ZodRecordDef<Key, Value>, RecordType<Key["_input"], Value["_input"]>> {
    get keySchema(): Key;
    get valueSchema(): Value;
    _parse(input: ParseInput): ParseReturnType<this["_output"]>;
    get element(): Value;
    static create<Value extends ZodTypeAny>(valueType: Value, params?: RawCreateParams): ZodRecord<ZodString, Value>;
    static create<Keys extends KeySchema, Value extends ZodTypeAny>(keySchema: Keys, valueType: Value, params?: RawCreateParams): ZodRecord<Keys, Value>;
}
export interface ZodMapDef<Key extends ZodTypeAny = ZodTypeAny, Value extends ZodTypeAny = ZodTypeAny> extends ZodTypeDef {
    valueType: Value;
    keyType: Key;
    typeName: ZodFirstPartyTypeKind.ZodMap;
}
export declare class ZodMap<Key extends ZodTypeAny = ZodTypeAny, Value extends ZodTypeAny = ZodTypeAny> extends ZodType<Map<Key["_output"], Value["_output"]>, ZodMapDef<Key, Value>, Map<Key["_input"], Value["_input"]>> {
    _parse(input: ParseInput): ParseReturnType<this["_output"]>;
    static create: <Key_1 extends ZodTypeAny = ZodTypeAny, Value_1 extends ZodTypeAny = ZodTypeAny>(keyType: Key_1, valueType: Value_1, params?: RawCreateParams) => ZodMap<Key_1, Value_1>;
}
export interface ZodSetDef<Value extends ZodTypeAny = ZodTypeAny> extends ZodTypeDef {
    valueType: Value;
    typeName: ZodFirstPartyTypeKind.ZodSet;
    minSize: {
        value: number;
        message?: string;
    } | null;
    maxSize: {
        value: number;
        message?: string;
    } | null;
}
export declare class ZodSet<Value extends ZodTypeAny = ZodTypeAny> extends ZodType<Set<Value["_output"]>, ZodSetDef<Value>, Set<Value["_input"]>> {
    _parse(input: ParseInput): ParseReturnType<this["_output"]>;
    min(minSize: number, message?: errorUtil.ErrMessage): this;
    max(maxSize: number, message?: errorUtil.ErrMessage): this;
    size(size: number, message?: errorUtil.ErrMessage): this;
    nonempty(message?: errorUtil.ErrMessage): ZodSet<Value>;
    static create: <Value_1 extends ZodTypeAny = ZodTypeAny>(valueType: Value_1, params?: RawCreateParams) => ZodSet<Value_1>;
}
export interface ZodFunctionDef<Args extends ZodTuple<any, any> = ZodTuple<any, any>, Returns extends ZodTypeAny = ZodTypeAny> extends ZodTypeDef {
    args: Args;
    returns: Returns;
    typeName: ZodFirstPartyTypeKind.ZodFunction;
}
export declare type OuterTypeOfFunction<Args extends ZodTuple<any, any>, Returns extends ZodTypeAny> = Args["_input"] extends Array<any> ? (...args: Args["_input"]) => Returns["_output"] : never;
export declare type InnerTypeOfFunction<Args extends ZodTuple<any, any>, Returns extends ZodTypeAny> = Args["_output"] extends Array<any> ? (...args: Args["_output"]) => Returns["_input"] : never;
export declare class ZodFunction<Args extends ZodTuple<any, any>, Returns extends ZodTypeAny> extends ZodType<OuterTypeOfFunction<Args, Returns>, ZodFunctionDef<Args, Returns>, InnerTypeOfFunction<Args, Returns>> {
    _parse(input: ParseInput): ParseReturnType<any>;
    parameters(): Args;
    returnType(): Returns;
    args<Items extends Parameters<typeof ZodTuple["create"]>[0]>(...items: Items): ZodFunction<ZodTuple<Items, ZodUnknown>, Returns>;
    returns<NewReturnType extends ZodType<any, any>>(returnType: NewReturnType): ZodFunction<Args, NewReturnType>;
    implement<F extends InnerTypeOfFunction<Args, Returns>>(func: F): ReturnType<F> extends Returns["_output"] ? (...args: Args["_input"]) => ReturnType<F> : OuterTypeOfFunction<Args, Returns>;
    strictImplement(func: InnerTypeOfFunction<Args, Returns>): InnerTypeOfFunction<Args, Returns>;
    validate: <F extends InnerTypeOfFunction<Args, Returns>>(func: F) => ReturnType<F> extends Returns["_output"] ? (...args: Args["_input"]) => ReturnType<F> : OuterTypeOfFunction<Args, Returns>;
    static create(): ZodFunction<ZodTuple<[], ZodUnknown>, ZodUnknown>;
    static create<T extends AnyZodTuple = ZodTuple<[], ZodUnknown>>(args: T): ZodFunction<T, ZodUnknown>;
    static create<T extends AnyZodTuple, U extends ZodTypeAny>(args: T, returns: U): ZodFunction<T, U>;
    static create<T extends AnyZodTuple = ZodTuple<[], ZodUnknown>, U extends ZodTypeAny = ZodUnknown>(args: T, returns: U, params?: RawCreateParams): ZodFunction<T, U>;
}
export interface ZodLazyDef<T extends ZodTypeAny = ZodTypeAny> extends ZodTypeDef {
    getter: () => T;
    typeName: ZodFirstPartyTypeKind.ZodLazy;
}
export declare class ZodLazy<T extends ZodTypeAny> extends ZodType<output<T>, ZodLazyDef<T>, input<T>> {
    get schema(): T;
    _parse(input: ParseInput): ParseReturnType<this["_output"]>;
    static create: <T_1 extends ZodTypeAny>(getter: () => T_1, params?: RawCreateParams) => ZodLazy<T_1>;
}
export interface ZodLiteralDef<T = any> extends ZodTypeDef {
    value: T;
    typeName: ZodFirstPartyTypeKind.ZodLiteral;
}
export declare class ZodLiteral<T> extends ZodType<T, ZodLiteralDef<T>> {
    _parse(input: ParseInput): ParseReturnType<this["_output"]>;
    get value(): T;
    static create: <T_1 extends Primitive>(value: T_1, params?: RawCreateParams) => ZodLiteral<T_1>;
}
export declare type ArrayKeys = keyof any[];
export declare type Indices<T> = Exclude<keyof T, ArrayKeys>;
export declare type EnumValues = [string, ...string[]];
export declare type Values<T extends EnumValues> = {
    [k in T[number]]: k;
};
export interface ZodEnumDef<T extends EnumValues = EnumValues> extends ZodTypeDef {
    values: T;
    typeName: ZodFirstPartyTypeKind.ZodEnum;
}
export declare type Writeable<T> = {
    -readonly [P in keyof T]: T[P];
};
declare function createZodEnum<U extends string, T extends Readonly<[U, ...U[]]>>(values: T, params?: RawCreateParams): ZodEnum<Writeable<T>>;
declare function createZodEnum<U extends string, T extends [U, ...U[]]>(values: T, params?: RawCreateParams): ZodEnum<T>;
export declare class ZodEnum<T extends [string, ...string[]]> extends ZodType<T[number], ZodEnumDef<T>> {
    _parse(input: ParseInput): ParseReturnType<this["_output"]>;
    get options(): T;
    get enum(): Values<T>;
    get Values(): Values<T>;
    get Enum(): Values<T>;
    static create: typeof createZodEnum;
}
export interface ZodNativeEnumDef<T extends EnumLike = EnumLike> extends ZodTypeDef {
    values: T;
    typeName: ZodFirstPartyTypeKind.ZodNativeEnum;
}
export declare type EnumLike = {
    [k: string]: string | number;
    [nu: number]: string;
};
export declare class ZodNativeEnum<T extends EnumLike> extends ZodType<T[keyof T], ZodNativeEnumDef<T>> {
    _parse(input: ParseInput): ParseReturnType<T[keyof T]>;
    get enum(): T;
    static create: <T_1 extends EnumLike>(values: T_1, params?: RawCreateParams) => ZodNativeEnum<T_1>;
}
export interface ZodPromiseDef<T extends ZodTypeAny = ZodTypeAny> extends ZodTypeDef {
    type: T;
    typeName: ZodFirstPartyTypeKind.ZodPromise;
}
export declare class ZodPromise<T extends ZodTypeAny> extends ZodType<Promise<T["_output"]>, ZodPromiseDef<T>, Promise<T["_input"]>> {
    _parse(input: ParseInput): ParseReturnType<this["_output"]>;
    static create: <T_1 extends ZodTypeAny>(schema: T_1, params?: RawCreateParams) => ZodPromise<T_1>;
}
export declare type Refinement<T> = (arg: T, ctx: RefinementCtx) => any;
export declare type SuperRefinement<T> = (arg: T, ctx: RefinementCtx) => void;
export declare type RefinementEffect<T> = {
    type: "refinement";
    refinement: (arg: T, ctx: RefinementCtx) => any;
};
export declare type TransformEffect<T> = {
    type: "transform";
    transform: (arg: T, ctx: RefinementCtx) => any;
};
export declare type PreprocessEffect<T> = {
    type: "preprocess";
    transform: (arg: T) => any;
};
export declare type Effect<T> = RefinementEffect<T> | TransformEffect<T> | PreprocessEffect<T>;
export interface ZodEffectsDef<T extends ZodTypeAny = ZodTypeAny> extends ZodTypeDef {
    schema: T;
    typeName: ZodFirstPartyTypeKind.ZodEffects;
    effect: Effect<any>;
}
export declare class ZodEffects<T extends ZodTypeAny, Output = output<T>, Input = input<T>> extends ZodType<Output, ZodEffectsDef<T>, Input> {
    innerType(): T;
    sourceType(): T;
    _parse(input: ParseInput): ParseReturnType<this["_output"]>;
    static create: <I extends ZodTypeAny>(schema: I, effect: Effect<I["_output"]>, params?: RawCreateParams) => ZodEffects<I, I["_output"], input<I>>;
    static createWithPreprocess: <I extends ZodTypeAny>(preprocess: (arg: unknown) => unknown, schema: I, params?: RawCreateParams) => ZodEffects<I, I["_output"], unknown>;
}
export { ZodEffects as ZodTransformer };
export interface ZodOptionalDef<T extends ZodTypeAny = ZodTypeAny> extends ZodTypeDef {
    innerType: T;
    typeName: ZodFirstPartyTypeKind.ZodOptional;
}
export declare type ZodOptionalType<T extends ZodTypeAny> = ZodOptional<T>;
export declare class ZodOptional<T extends ZodTypeAny> extends ZodType<T["_output"] | undefined, ZodOptionalDef<T>, T["_input"] | undefined> {
    _parse(input: ParseInput): ParseReturnType<this["_output"]>;
    unwrap(): T;
    static create: <T_1 extends ZodTypeAny>(type: T_1, params?: RawCreateParams) => ZodOptional<T_1>;
}
export interface ZodNullableDef<T extends ZodTypeAny = ZodTypeAny> extends ZodTypeDef {
    innerType: T;
    typeName: ZodFirstPartyTypeKind.ZodNullable;
}
export declare type ZodNullableType<T extends ZodTypeAny> = ZodNullable<T>;
export declare class ZodNullable<T extends ZodTypeAny> extends ZodType<T["_output"] | null, ZodNullableDef<T>, T["_input"] | null> {
    _parse(input: ParseInput): ParseReturnType<this["_output"]>;
    unwrap(): T;
    static create: <T_1 extends ZodTypeAny>(type: T_1, params?: RawCreateParams) => ZodNullable<T_1>;
}
export interface ZodDefaultDef<T extends ZodTypeAny = ZodTypeAny> extends ZodTypeDef {
    innerType: T;
    defaultValue: () => util.noUndefined<T["_input"]>;
    typeName: ZodFirstPartyTypeKind.ZodDefault;
}
export declare class ZodDefault<T extends ZodTypeAny> extends ZodType<util.noUndefined<T["_output"]>, ZodDefaultDef<T>, T["_input"] | undefined> {
    _parse(input: ParseInput): ParseReturnType<this["_output"]>;
    removeDefault(): T;
    static create: <T_1 extends ZodTypeAny>(type: T_1, params: {
        errorMap?: ZodErrorMap | undefined;
        invalid_type_error?: string | undefined;
        required_error?: string | undefined;
        description?: string | undefined;
    } & {
        default: T_1["_input"] | (() => util.noUndefined<T_1["_input"]>);
    }) => ZodDefault<T_1>;
}
export interface ZodCatchDef<T extends ZodTypeAny = ZodTypeAny> extends ZodTypeDef {
    innerType: T;
    defaultValue: () => T["_input"];
    typeName: ZodFirstPartyTypeKind.ZodCatch;
}
export declare class ZodCatch<T extends ZodTypeAny> extends ZodType<util.noUndefined<T["_output"]>, ZodCatchDef<T>, T["_input"] | undefined> {
    _parse(input: ParseInput): ParseReturnType<this["_output"]>;
    removeDefault(): T;
    static create: <T_1 extends ZodTypeAny>(type: T_1, params: {
        errorMap?: ZodErrorMap | undefined;
        invalid_type_error?: string | undefined;
        required_error?: string | undefined;
        description?: string | undefined;
    } & {
        default: T_1["_input"] | (() => T_1["_input"]);
    }) => ZodCatch<T_1>;
}
export interface ZodNaNDef extends ZodTypeDef {
    typeName: ZodFirstPartyTypeKind.ZodNaN;
}
export declare class ZodNaN extends ZodType<number, ZodNaNDef> {
    _parse(input: ParseInput): ParseReturnType<any>;
    static create: (params?: RawCreateParams) => ZodNaN;
}
export interface ZodBrandedDef<T extends ZodTypeAny> extends ZodTypeDef {
    type: T;
    typeName: ZodFirstPartyTypeKind.ZodBranded;
}
export declare const BRAND: unique symbol;
export declare type BRAND<T extends string | number | symbol> = {
    [BRAND]: {
        [k in T]: true;
    };
};
export declare class ZodBranded<T extends ZodTypeAny, B extends string | number | symbol> extends ZodType<T["_output"] & BRAND<B>, ZodBrandedDef<T>, T["_input"]> {
    _parse(input: ParseInput): ParseReturnType<any>;
    unwrap(): T;
}
export interface ZodPipelineDef<A extends ZodTypeAny, B extends ZodTypeAny> extends ZodTypeDef {
    in: A;
    out: B;
    typeName: ZodFirstPartyTypeKind.ZodPipeline;
}
export declare class ZodPipeline<A extends ZodTypeAny, B extends ZodTypeAny> extends ZodType<B["_output"], ZodPipelineDef<A, B>, A["_input"]> {
    _parse(input: ParseInput): ParseReturnType<any>;
    static create<A extends ZodTypeAny, B extends ZodTypeAny>(a: A, b: B): ZodPipeline<A, B>;
}
export declare const custom: <T>(check?: ((data: unknown) => any) | undefined, params?: Parameters<ZodTypeAny["refine"]>[1], fatal?: boolean | undefined) => ZodType<T, ZodTypeDef, T>;
export { ZodType as Schema, ZodType as ZodSchema };
export declare const late: {
    object: <T extends ZodRawShape>(shape: () => T, params?: RawCreateParams) => ZodObject<T, "strip", ZodTypeAny, { [k_1 in keyof objectUtil.addQuestionMarks<{ [k in keyof T]: T[k]["_output"]; }>]: objectUtil.addQuestionMarks<{ [k in keyof T]: T[k]["_output"]; }>[k_1]; }, { [k_3 in keyof objectUtil.addQuestionMarks<{ [k_2 in keyof T]: T[k_2]["_input"]; }>]: objectUtil.addQuestionMarks<{ [k_2 in keyof T]: T[k_2]["_input"]; }>[k_3]; }>;
};
export declare enum ZodFirstPartyTypeKind {
    ZodString = "ZodString",
    ZodNumber = "ZodNumber",
    ZodNaN = "ZodNaN",
    ZodBigInt = "ZodBigInt",
    ZodBoolean = "ZodBoolean",
    ZodDate = "ZodDate",
    ZodSymbol = "ZodSymbol",
    ZodUndefined = "ZodUndefined",
    ZodNull = "ZodNull",
    ZodAny = "ZodAny",
    ZodUnknown = "ZodUnknown",
    ZodNever = "ZodNever",
    ZodVoid = "ZodVoid",
    ZodArray = "ZodArray",
    ZodObject = "ZodObject",
    ZodUnion = "ZodUnion",
    ZodDiscriminatedUnion = "ZodDiscriminatedUnion",
    ZodIntersection = "ZodIntersection",
    ZodTuple = "ZodTuple",
    ZodRecord = "ZodRecord",
    ZodMap = "ZodMap",
    ZodSet = "ZodSet",
    ZodFunction = "ZodFunction",
    ZodLazy = "ZodLazy",
    ZodLiteral = "ZodLiteral",
    ZodEnum = "ZodEnum",
    ZodEffects = "ZodEffects",
    ZodNativeEnum = "ZodNativeEnum",
    ZodOptional = "ZodOptional",
    ZodNullable = "ZodNullable",
    ZodDefault = "ZodDefault",
    ZodCatch = "ZodCatch",
    ZodPromise = "ZodPromise",
    ZodBranded = "ZodBranded",
    ZodPipeline = "ZodPipeline"
}
export declare type ZodFirstPartySchemaTypes = ZodString | ZodNumber | ZodNaN | ZodBigInt | ZodBoolean | ZodDate | ZodUndefined | ZodNull | ZodAny | ZodUnknown | ZodNever | ZodVoid | ZodArray<any, any> | ZodObject<any, any, any, any, any> | ZodUnion<any> | ZodDiscriminatedUnion<any, any> | ZodIntersection<any, any> | ZodTuple<any, any> | ZodRecord<any, any> | ZodMap<any> | ZodSet<any> | ZodFunction<any, any> | ZodLazy<any> | ZodLiteral<any> | ZodEnum<any> | ZodEffects<any, any, any> | ZodNativeEnum<any> | ZodOptional<any> | ZodNullable<any> | ZodDefault<any> | ZodCatch<any> | ZodPromise<any> | ZodBranded<any, any> | ZodPipeline<any, any>;
declare abstract class Class {
    constructor(..._: any[]);
}
declare const instanceOfType: <T extends typeof Class>(cls: T, params?: Parameters<ZodTypeAny["refine"]>[1]) => ZodType<InstanceType<T>, ZodTypeDef, InstanceType<T>>;
declare const stringType: (params?: ({
    errorMap?: ZodErrorMap | undefined;
    invalid_type_error?: string | undefined;
    required_error?: string | undefined;
    description?: string | undefined;
} & {
    coerce?: true | undefined;
}) | undefined) => ZodString;
declare const numberType: (params?: ({
    errorMap?: ZodErrorMap | undefined;
    invalid_type_error?: string | undefined;
    required_error?: string | undefined;
    description?: string | undefined;
} & {
    coerce?: boolean | undefined;
}) | undefined) => ZodNumber;
declare const nanType: (params?: RawCreateParams) => ZodNaN;
declare const bigIntType: (params?: ({
    errorMap?: ZodErrorMap | undefined;
    invalid_type_error?: string | undefined;
    required_error?: string | undefined;
    description?: string | undefined;
} & {
    coerce?: boolean | undefined;
}) | undefined) => ZodBigInt;
declare const booleanType: (params?: ({
    errorMap?: ZodErrorMap | undefined;
    invalid_type_error?: string | undefined;
    required_error?: string | undefined;
    description?: string | undefined;
} & {
    coerce?: boolean | undefined;
}) | undefined) => ZodBoolean;
declare const dateType: (params?: ({
    errorMap?: ZodErrorMap | undefined;
    invalid_type_error?: string | undefined;
    required_error?: string | undefined;
    description?: string | undefined;
} & {
    coerce?: boolean | undefined;
}) | undefined) => ZodDate;
declare const symbolType: (params?: RawCreateParams) => ZodSymbol;
declare const undefinedType: (params?: RawCreateParams) => ZodUndefined;
declare const nullType: (params?: RawCreateParams) => ZodNull;
declare const anyType: (params?: RawCreateParams) => ZodAny;
declare const unknownType: (params?: RawCreateParams) => ZodUnknown;
declare const neverType: (params?: RawCreateParams) => ZodNever;
declare const voidType: (params?: RawCreateParams) => ZodVoid;
declare const arrayType: <T extends ZodTypeAny>(schema: T, params?: RawCreateParams) => ZodArray<T, "many">;
declare const objectType: <T extends ZodRawShape>(shape: T, params?: RawCreateParams) => ZodObject<T, "strip", ZodTypeAny, { [k_1 in keyof objectUtil.addQuestionMarks<{ [k in keyof T]: T[k]["_output"]; }>]: objectUtil.addQuestionMarks<{ [k in keyof T]: T[k]["_output"]; }>[k_1]; }, { [k_3 in keyof objectUtil.addQuestionMarks<{ [k_2 in keyof T]: T[k_2]["_input"]; }>]: objectUtil.addQuestionMarks<{ [k_2 in keyof T]: T[k_2]["_input"]; }>[k_3]; }>;
declare const strictObjectType: <T extends ZodRawShape>(shape: T, params?: RawCreateParams) => ZodObject<T, "strict", ZodTypeAny, { [k_1 in keyof objectUtil.addQuestionMarks<{ [k in keyof T]: T[k]["_output"]; }>]: objectUtil.addQuestionMarks<{ [k in keyof T]: T[k]["_output"]; }>[k_1]; }, { [k_3 in keyof objectUtil.addQuestionMarks<{ [k_2 in keyof T]: T[k_2]["_input"]; }>]: objectUtil.addQuestionMarks<{ [k_2 in keyof T]: T[k_2]["_input"]; }>[k_3]; }>;
declare const unionType: <T extends readonly [ZodTypeAny, ZodTypeAny, ...ZodTypeAny[]]>(types: T, params?: RawCreateParams) => ZodUnion<T>;
declare const discriminatedUnionType: typeof ZodDiscriminatedUnion.create;
declare const intersectionType: <T extends ZodTypeAny, U extends ZodTypeAny>(left: T, right: U, params?: RawCreateParams) => ZodIntersection<T, U>;
declare const tupleType: <T extends [] | [ZodTypeAny, ...ZodTypeAny[]]>(schemas: T, params?: RawCreateParams) => ZodTuple<T, null>;
declare const recordType: typeof ZodRecord.create;
declare const mapType: <Key extends ZodTypeAny = ZodTypeAny, Value extends ZodTypeAny = ZodTypeAny>(keyType: Key, valueType: Value, params?: RawCreateParams) => ZodMap<Key, Value>;
declare const setType: <Value extends ZodTypeAny = ZodTypeAny>(valueType: Value, params?: RawCreateParams) => ZodSet<Value>;
declare const functionType: typeof ZodFunction.create;
declare const lazyType: <T extends ZodTypeAny>(getter: () => T, params?: RawCreateParams) => ZodLazy<T>;
declare const literalType: <T extends Primitive>(value: T, params?: RawCreateParams) => ZodLiteral<T>;
declare const enumType: typeof createZodEnum;
declare const nativeEnumType: <T extends EnumLike>(values: T, params?: RawCreateParams) => ZodNativeEnum<T>;
declare const promiseType: <T extends ZodTypeAny>(schema: T, params?: RawCreateParams) => ZodPromise<T>;
declare const effectsType: <I extends ZodTypeAny>(schema: I, effect: Effect<I["_output"]>, params?: RawCreateParams) => ZodEffects<I, I["_output"], input<I>>;
declare const optionalType: <T extends ZodTypeAny>(type: T, params?: RawCreateParams) => ZodOptional<T>;
declare const nullableType: <T extends ZodTypeAny>(type: T, params?: RawCreateParams) => ZodNullable<T>;
declare const preprocessType: <I extends ZodTypeAny>(preprocess: (arg: unknown) => unknown, schema: I, params?: RawCreateParams) => ZodEffects<I, I["_output"], unknown>;
declare const pipelineType: typeof ZodPipeline.create;
declare const ostring: () => ZodOptional<ZodString>;
declare const onumber: () => ZodOptional<ZodNumber>;
declare const oboolean: () => ZodOptional<ZodBoolean>;
export declare const coerce: {
    string: (params?: ({
        errorMap?: ZodErrorMap | undefined;
        invalid_type_error?: string | undefined;
        required_error?: string | undefined;
        description?: string | undefined;
    } & {
        coerce?: true | undefined;
    }) | undefined) => ZodString;
    number: (params?: ({
        errorMap?: ZodErrorMap | undefined;
        invalid_type_error?: string | undefined;
        required_error?: string | undefined;
        description?: string | undefined;
    } & {
        coerce?: boolean | undefined;
    }) | undefined) => ZodNumber;
    boolean: (params?: ({
        errorMap?: ZodErrorMap | undefined;
        invalid_type_error?: string | undefined;
        required_error?: string | undefined;
        description?: string | undefined;
    } & {
        coerce?: boolean | undefined;
    }) | undefined) => ZodBoolean;
    bigint: (params?: ({
        errorMap?: ZodErrorMap | undefined;
        invalid_type_error?: string | undefined;
        required_error?: string | undefined;
        description?: string | undefined;
    } & {
        coerce?: boolean | undefined;
    }) | undefined) => ZodBigInt;
    date: (params?: ({
        errorMap?: ZodErrorMap | undefined;
        invalid_type_error?: string | undefined;
        required_error?: string | undefined;
        description?: string | undefined;
    } & {
        coerce?: boolean | undefined;
    }) | undefined) => ZodDate;
};
export { anyType as any, arrayType as array, bigIntType as bigint, booleanType as boolean, dateType as date, discriminatedUnionType as discriminatedUnion, effectsType as effect, enumType as enum, functionType as function, instanceOfType as instanceof, intersectionType as intersection, lazyType as lazy, literalType as literal, mapType as map, nanType as nan, nativeEnumType as nativeEnum, neverType as never, nullType as null, nullableType as nullable, numberType as number, objectType as object, oboolean, onumber, optionalType as optional, ostring, pipelineType as pipeline, preprocessType as preprocess, promiseType as promise, recordType as record, setType as set, strictObjectType as strictObject, stringType as string, symbolType as symbol, effectsType as transformer, tupleType as tuple, undefinedType as undefined, unionType as union, unknownType as unknown, voidType as void, };
export declare const NEVER: never;
