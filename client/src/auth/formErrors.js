export function toFormErrors(err) {
  const fields = {};

  for (const detail of err.details ?? []) {
    if (!(detail.field in fields)) {
      fields[detail.field] = detail.message;
    }
  }

  return {
    fields,
    general: Object.keys(fields).length === 0 ? err.message : '',
  };
}