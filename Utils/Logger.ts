export const logObject = (label: string, obj: any) => {
    console.log(
        `🔍 ${label}:`,
        typeof obj === "object" ? JSON.stringify(obj, null, 2) : obj
    );
};

export const logStateUpdate = (label: string, data: any) => {
    if (__DEV__) {
        console.log(
            `📊 ${label}:`,
            typeof data === "object" ? JSON.stringify(data) : data
        );
    }
};
