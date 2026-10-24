export function validate(schemas) {
    return (req, res, next) => {
        const valid = {};
        const details = [];

        for (const [source, schema] of Object.entries(schemas)) {
            const input = source === 'body' ? (req.body ?? {}) : req[source];
            const result = schema.safeParse(input);

            if (result.success) {
                valid[source] = result.data;
            } else {
                for (const issue of result.error.issues) {
                    details.push({ field: issue.path.join('.'), message: issue.message });
                }
            }
        }

        if (details.length > 0) {
            return res.status(400).json({ error: details[0].message, details });
        }

        req.valid = valid;
        next();
    };
}