export async function belongsToEmployeeContractFolder(
  drive,
  file,
  cedula,
  category
) {
  const parentId = file.parents?.[0];
  if (!parentId) return false;

  const { data: parent } = await drive.files.get({
    fileId: parentId,
    fields: "name,parents",
    supportsAllDrives: true,
  });

  let employeeFolder = parent;
  if (parent.name === category) {
    const employeeFolderId = parent.parents?.[0];
    if (!employeeFolderId) return false;

    const { data } = await drive.files.get({
      fileId: employeeFolderId,
      fields: "name",
      supportsAllDrives: true,
    });
    employeeFolder = data;
  }

  return employeeFolder.name === cedula
    || employeeFolder.name.startsWith(`${cedula}_`);
}
