import { MAX_INT } from "../constants.js";

export function parseMaxMissing(raw) {
    if (raw === undefined){
        return { value: null }
    }

    if (typeof raw !== 'string' || !/^\d+$/.test(raw) || Number(raw) > MAX_INT){
        return { error: 'maxMissing must be a non_negative integer' };
    }

    return { value: Number(raw) }
}