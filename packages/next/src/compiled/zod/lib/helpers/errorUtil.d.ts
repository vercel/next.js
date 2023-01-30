export declare namespace errorUtil {
    type ErrMessage = string | {
        message?: string;
    };
    const errToObj: (message?: ErrMessage | undefined) => {
        message?: string | undefined;
    };
    const toString: (message?: ErrMessage | undefined) => string | undefined;
}
