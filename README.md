# Formulario de personal

## Google Drive

El backend de `backend/server.js` recibe los documentos en `/api/archivos` y los guarda en Google Drive. Supabase continúa almacenando temporalmente los datos de empleados, usuarios y las URLs de los archivos.

### Configuración local

1. En Google Cloud crea un proyecto, habilita **Google Drive API** y crea una cuenta de servicio.
2. En Google Workspace, crea o usa una **Unidad compartida**, agrega la cuenta de servicio como colaboradora y crea allí la carpeta raíz de documentos. Una carpeta de "Mi unidad" compartida con una cuenta de servicio no le asigna cuota de almacenamiento.
3. Comparte el archivo `.xlsx` de Drive con el correo `client_email` de la cuenta de servicio como editor.
4. Crea `backend/.env` y configura `GOOGLE_DRIVE_FOLDER_ID`, `GOOGLE_SPREADSHEET_ID` con el ID del archivo `.xlsx` en Drive y `GOOGLE_SHEET_NAME` con el nombre exacto de la pestaña donde se agregarán empleados. Apunta `GOOGLE_SERVICE_ACCOUNT_FILE` al JSON descargado (o configura `GOOGLE_SERVICE_ACCOUNT_JSON`). No subas el archivo ni las credenciales al repositorio.
5. Ejecuta `npm run dev:full`.

El backend quedará en `http://localhost:3001` y Vite en `http://localhost:5173`. `npm run dev:full` espera a que `/api/health` confirme que el backend está listo antes de iniciar Vite, para evitar errores de proxy durante el arranque. Para una instalación pública con un backend separado, define `VITE_API_URL` con su URL HTTPS.
En el backend local, los valores de `backend/.env` prevalecen sobre variables con el mismo nombre heredadas del proceso que inicia VS Code. Si cambias el ID del Excel, reinicia `npm run dev:full`. Un error 404 de Drive puede indicar que el ID es incorrecto o que la cuenta de servicio/OAuth no tiene acceso; comparte el archivo `.xlsx` con esa cuenta como editor.
La cuenta de servicio renueva sus tokens de acceso automáticamente; no tienes que volver a generar ni pegar tokens periódicamente. Guarda el JSON de credenciales como secreto y no lo subas al repositorio. Si eliges este método, no configures `GOOGLE_OAUTH_CLIENT_FILE`.

### Configuración en Netlify

El proyecto incluye funciones serverless en `netlify/functions`. En Netlify abre **Site configuration > Environment variables > Add a variable** y agrega estas variables para los contextos que uses (Production y, si aplica, Deploy previews):

- `GOOGLE_SERVICE_ACCOUNT_JSON`: contenido completo del JSON de la cuenta de servicio.
- `GOOGLE_DRIVE_FOLDER_ID`: ID de la carpeta raíz de Drive.
- `DRIVE_PUBLIC_FILES`: `true` si los enlaces deben abrir sin iniciar sesión.
- `GOOGLE_SPREADSHEET_ID` (ID del archivo `.xlsx` en Drive) y `GOOGLE_SHEET_NAME` (nombre exacto de la pestaña): necesarias para agregar empleados al Excel existente. El archivo se actualiza conservando las fórmulas de sus celdas.
- Para una cuenta Gmail personal, usa `GOOGLE_OAUTH_CLIENT_JSON` (el JSON OAuth descargado de Google Cloud) y `GOOGLE_OAUTH_REFRESH_TOKEN` (el token `refresh_token` creado por el backend local). No configures credenciales de cuenta de servicio para este modo.

Después de guardar las variables, ejecuta un nuevo deploy. Netlify no aplica cambios de variables a los deploys anteriores.

Configura `GOOGLE_DRIVE_FOLDER_ID` con el ID de una carpeta dentro de esa Unidad compartida; el código ya usa la API de Drive compatible con unidades compartidas. Comparte también la hoja de cálculo con el correo `client_email` de la cuenta de servicio como editor. Netlify usará automáticamente `/api/archivos` para subir a Drive y `/api/hoja-empleados` para registrar empleados. No subas el JSON de credenciales al repositorio.

El formulario agrega los empleados al final de la pestaña configurada en el archivo `.xlsx` existente de Drive; no lo convierte a Google Sheets. La cuenta que autoriza el acceso debe tener permiso de editor en ese archivo. El formulario público puede subir archivos únicamente a las carpetas `cedulas`, `certificados-bancarios`, `certificados-eps`, `certificados-pension`, `fotografias` y `firmas`, sin iniciar sesión como administrador. Acepta PDF/JPG/PNG en documentos, JPG/PNG en fotos y firmas, con máximo de 5 MB. Las demás operaciones de archivos siguen requiriendo una sesión de administrador. Después de actualizar código, publica un nuevo deploy en Netlify para que la función aplique el cambio.

En el panel de administración, **SUBIR A DRIVE Y EXCEL** sincroniza todos los empleados existentes en Supabase con la pestaña configurada del `.xlsx` y crea sus carpetas. Los documentos ya alojados en Drive se mueven y renombran dentro de la carpeta del empleado, evitando dejar copias; las copias antiguas creadas por sincronizaciones previas se envían a la papelera. Los archivos accesibles del bucket `documentos-empleados` de Supabase Storage se copian a Drive. Las filas se actualizan por cédula y las URL de Drive se guardan en Supabase. Los documentos que no se puedan procesar o que provengan de un servicio no compatible se detallan al finalizar, sin detener la sincronización del resto.

En el formulario público, **GUARDAR AVANCE** conserva los datos y documentos cargados en Supabase sin finalizar el registro. Al volver a ingresar con la misma cédula autorizada, la persona puede continuar desde ese avance. El estado de avance se determina con los campos y documentos obligatorios, por lo que no hace falta una columna de estado. Para registrar el consentimiento de tratamiento de datos, ejecuta [database/autorizacion-datos.sql](./database/autorizacion-datos.sql) en el SQL Editor del mismo proyecto Supabase que usa la app. **FINALIZAR Y ENVIAR** sigue validando los campos y documentos obligatorios.

## Flujo de contratos

En **Contratos**, administración puede generar y revisar el borrador rellenado automáticamente en la vista previa de Word de la aplicación. La vista previa web puede diferir de Microsoft Word; descarga el DOCX para comprobar fielmente su formato. **PUBLICAR PDF PARA EL EMPLEADO** convierte el DOCX de la vista previa a PDF en Google Drive y publica ese PDF para que el empleado pueda verlo dentro de su cuenta. En la carga manual se aceptan PDF y documentos Word `.doc`/`.docx`; los Word se convierten a PDF antes de publicarse. Los contratos Word que ya estaban publicados también se convierten a PDF al consultarlos.

Para agregar los lugares del contrato, ejecuta `database/contratos.sql` en el SQL Editor del mismo proyecto Supabase que usa la aplicación. En **Editar datos del contrato** se guardan los lugares de labores y contratación y el frente de obra. El contrato conserva el renglón de firma del testigo; la firma fija se incorporará cuando sea proporcionada. El contrato usa las tarifas diarias tal como están registradas y calcula el auxilio de transporte conforme a los valores legales del año de inicio del contrato (2025 y 2026).

Al usar **Borrar** en la sección **Contratos**, el sistema elimina de Google Drive o Supabase Storage todos los archivos publicados y firmados asociados al empleado, y luego limpia sus referencias y el estado del contrato en Supabase. Si falla la eliminación remota, muestra un error y conserva las referencias para poder volver a intentarlo.

Los documentos se guardan juntos en una carpeta por empleado llamada `CEDULA_NOMBRE COMPLETO`. Cada archivo se nombra con la cédula, el nombre de la persona y el tipo de documento, por ejemplo `123456_Ana Perez_cedula-frente.jpg`, `123456_Ana Perez_certificado-eps.pdf` o `123456_Ana Perez_contrato.pdf`. Al ejecutar la sincronización desde el panel, también se renombran los documentos existentes que ya estén asociados al empleado en su carpeta de Drive; no se modifica su contenido ni su enlace.

Al eliminar un empleado desde el panel de administración, también se borran sus archivos de Drive y Storage y se limpian sus datos en la fila correspondiente del Excel. Las celdas con fórmulas se conservan.

Las cuentas de servicio no tienen cuota de almacenamiento propia en "Mi unidad". Si no tienes Google Workspace con Unidades compartidas, se debe cambiar la integración para usar OAuth de una cuenta de Google humana; compartirle una carpeta de "Mi unidad" a la cuenta de servicio no resuelve este error. En ese caso no hay un token permanente: configura OAuth una vez y Google renueva el token de acceso automáticamente mientras el refresh token siga vigente; si el proyecto OAuth sigue en estado Testing, Google puede revocarlo a los 7 días.

Para generar el token OAuth personal, configura `GOOGLE_OAUTH_CLIENT_FILE` y `GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3001/auth/google/callback` en `backend/.env`, agrega esa URL como redirección autorizada en el cliente OAuth de Google Cloud, ejecuta `npm run dev:full` y abre `http://localhost:3001/auth/google` con la cuenta propietaria del Drive y del archivo `.xlsx`. Acepta el permiso de Drive; vuelve a autorizar incluso si ya existe `backend/.drive-token.json` cuando el token anterior haya expirado o sido revocado. Copia el JSON OAuth y el `refresh_token` de ese archivo en las variables secretas de Netlify; nunca los publiques ni los envíes por chat. Después, configura `GOOGLE_DRIVE_FOLDER_ID` con una carpeta de "Mi unidad" de esa cuenta y vuelve a desplegar.

Si el backend responde `invalid_grant`, el token de `backend/.drive-token.json` expiró o fue revocado. En la cuenta Google propietaria, revoca el acceso de esta aplicación en Seguridad > Conexiones con aplicaciones de terceros; luego inicia de nuevo el backend, abre `http://localhost:3001/auth/google` y concede los permisos. El callback guardará un token nuevo. Para Netlify, actualiza también la variable secreta `GOOGLE_OAUTH_REFRESH_TOKEN` con el `refresh_token` nuevo y vuelve a desplegar. Trata siempre los tokens como contraseñas.

`GOOGLE_SERVICE_ACCOUNT_JSON` debe ser el JSON completo de la cuenta de servicio, incluyendo `client_email` y `private_key`. Si configuras las variables por separado en lugar del JSON, usa `GOOGLE_CLIENT_EMAIL` y `GOOGLE_PRIVATE_KEY`; en la clave privada conserva los saltos de línea como `\n`.

Si no defines `VITE_API_URL`, el frontend usa las funciones de Netlify del mismo dominio. La eliminación de empleados invoca directamente `/.netlify/functions/eliminar-empleado`; en desarrollo local usa el backend de `http://localhost:3001`. Después de cambiar esta integración, publica un nuevo deploy que incluya `netlify/functions/eliminar-empleado.js`.

`DRIVE_PUBLIC_FILES=true` permite que los enlaces guardados puedan abrirse sin iniciar sesión en Google. Como estos documentos contienen datos personales, en producción conviene usar `false` y proteger el backend con autenticación antes de entregar enlaces.
