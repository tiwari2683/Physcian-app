export const unmarshallDynamoDBObject = (dbObject: any): any => {
    console.log(
        "🔄 unmarshallDynamoDBObject called with:",
        typeof dbObject === "object"
            ? `object of type ${dbObject && dbObject.constructor
                ? dbObject.constructor.name
                : "unknown"
            }`
            : typeof dbObject
    );

    if (!dbObject) {
        console.log(
            "⚠️ unmarshallDynamoDBObject: Null or undefined input, returning null"
        );
        return null;
    }

    // Log the object keys to help with debugging
    if (typeof dbObject === "object") {
        console.log("📋 Object keys:", Object.keys(dbObject).join(", "));

        // Check if specific DynamoDB markers are present
        const hasDynamoDBMarkers =
            dbObject.M !== undefined ||
            dbObject.S !== undefined ||
            dbObject.N !== undefined ||
            dbObject.BOOL !== undefined ||
            dbObject.L !== undefined;

        console.log(`🔍 Has DynamoDB type markers: ${hasDynamoDBMarkers}`);
    }

    // Handle case where the object is already in plain JS format
    if (!dbObject.M && !dbObject.S && !dbObject.N && !dbObject.BOOL) {
        console.log("✅ Object already in plain JS format, returning as is");
        return dbObject;
    }

    // Handle specific DynamoDB types
    if (dbObject.S !== undefined) {
        console.log(`🔤 Converting String value: ${dbObject.S}`);
        return dbObject.S;
    }

    if (dbObject.N !== undefined) {
        console.log(`🔢 Converting Number value: ${dbObject.N}`);
        return Number(dbObject.N);
    }

    if (dbObject.BOOL !== undefined) {
        console.log(`⚖️ Converting Boolean value: ${dbObject.BOOL}`);
        return dbObject.BOOL;
    }

    if (dbObject.NULL !== undefined) {
        console.log("🚫 Converting NULL value");
        return null;
    }

    // Handle maps (M)
    if (dbObject.M) {
        console.log("🗺️ Converting Map with keys:", Object.keys(dbObject.M));
        const result: any = {};
        for (const key in dbObject.M) {
            console.log(`🔑 Processing map key: ${key}`);
            result[key] = unmarshallDynamoDBObject(dbObject.M[key]);
        }
        console.log("✅ Map conversion complete with keys:", Object.keys(result));
        return result;
    }

    // Handle lists (L)
    if (dbObject.L) {
        console.log(`📊 Converting List with ${dbObject.L.length} items`);
        const result = dbObject.L.map((item: any, index: number) => {
            console.log(`📍 Processing list item ${index}`);
            return unmarshallDynamoDBObject(item);
        });
        console.log(`✅ List conversion complete with ${result.length} items`);
        return result;
    }

    console.log("⚠️ No recognized DynamoDB type, returning original object");
    return dbObject;
};
