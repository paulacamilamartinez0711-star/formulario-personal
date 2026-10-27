import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";
import { isFormularioEmpleadoCompleto } from "../../shared/formularioEstado.js";
import {
  limpiarRevisionesDocumentos,
  obtenerDocumentosPorCorregir,
} from "../../shared/documentReview.js";
import logoRD from "../assets/Logo RD Soluciones.jpg.jpeg";
import "./Formulario.css";

function Formulario({ onSaved, correctionOnly = false }) {
  const cedulaSesion = localStorage.getItem("usuarioCedula") || "";
  const nombreSesion = localStorage.getItem("usuarioNombre") || "";
  const [formulario, setFormulario] = useState({
    cedula: cedulaSesion,
    nombre_completo: nombreSesion,
    correo: "",
    cargo: "",
    proyecto: "",

    lugar_expedicion_departamento: "",
    lugar_expedicion_municipio: "",

    fecha_nacimiento: "",

    lugar_nacimiento_departamento: "",
    lugar_nacimiento_municipio: "",

    celular: "",
    direccion: "",

    ciudad_departamento: "",
    ciudad_municipio: "",

    salario_basico: "",
    auxilio_1: "",
    auxilio_2: "",
    bono_productividad: "",

    cuenta_bancaria: "",
    entidad_financiera: "",

    persona_contacto: "",
    celular_contacto: "",
    parentesco: "",

    estado_civil: "",
    tipo_sangre: "",

    eps: "",
    eps_otra: "",

    fondo_pension: "",
    fondo_pension_otra: "",

    talla_botas: "",
    talla_camisa: "",
    talla_pantalon: "",

    fecha_inicio_contrato: "",
    objeto_contrato: "",
  });

  const [cedulaFrente, setCedulaFrente] = useState(null);
  const [cedulaRespaldo, setCedulaRespaldo] = useState(null);
  const [certificadoBancario, setCertificadoBancario] = useState(null);
  const [certificadoEPS, setCertificadoEPS] = useState(null);
  const [certificadoPension, setCertificadoPension] = useState(null);
  const [fotografia, setFotografia] = useState(null);
  const [cameraStream, setCameraStream] = useState(null);
  const [cameraError, setCameraError] = useState("");
  const [cameraTarget, setCameraTarget] = useState(null);
  const [firma, setFirma] = useState(null);
  const [firmaReset, setFirmaReset] = useState(0);
  const [archivoFirmaGuardado, setArchivoFirmaGuardado] = useState("");

  const cameraVideoRef = useRef(null);
  const [guardando, setGuardando] = useState(false);
  const [aceptaAutorizacion, setAceptaAutorizacion] = useState(false);
  const [cargandoBorrador, setCargandoBorrador] = useState(
    () => Boolean(localStorage.getItem("usuarioCedula"))
  );
  const [registroEmpleadoId, setRegistroEmpleadoId] = useState(null);
  const [documentosGuardados, setDocumentosGuardados] = useState({});
  const [documentosRevision, setDocumentosRevision] = useState({});
  const [mensajeGuardado, setMensajeGuardado] = useState("");

  useEffect(() => {
    let activo = true;
    const cedula = localStorage.getItem("usuarioCedula");
    if (!cedula) {
      return undefined;
    }

    const cargarBorrador = async () => {
      const { data, error } = await supabase
        .from("empleados")
        .select("*")
        .eq("cedula", cedula)
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("No se pudo recuperar el borrador del formulario:", error);
        if (activo) setMensajeGuardado("No se pudo recuperar la información guardada. Intenta actualizar la página.");
        if (activo) setCargandoBorrador(false);
        return;
      }

      if (activo && data && (
        !isFormularioEmpleadoCompleto(data)
        || obtenerDocumentosPorCorregir(data.documentos_revision).length > 0
      )) {
        setRegistroEmpleadoId(data.id);
        setFormulario((actual) => Object.fromEntries(
          Object.keys(actual).map((campo) => [
            campo,
            data[campo] == null ? actual[campo] : String(data[campo]),
          ])
        ));
        setDocumentosGuardados({
          cedulaFrente: data.cedula_frente_url || "",
          cedulaRespaldo: data.cedula_respaldo_url || "",
          certificadoBancario: data.certificado_bancario_url || "",
          certificadoEPS: data.certificado_eps_url || "",
          certificadoPension: data.certificado_pension_url || "",
          fotografia: data.fotografia_url || "",
          firma: data.firma_url || "",
        });
        setArchivoFirmaGuardado(data.firma_url || "");
        setAceptaAutorizacion(Boolean(data.autorizacion_datos));
        setDocumentosRevision(data.documentos_revision || {});
        setMensajeGuardado(
          obtenerDocumentosPorCorregir(data.documentos_revision).length > 0
            ? "Administración revisó tus documentos. Lee las observaciones y carga nuevamente los documentos solicitados."
            : "Recuperamos tu avance guardado. Puedes continuar donde lo dejaste."
        );
      }
      if (activo) setCargandoBorrador(false);
    };

    void cargarBorrador();
    return () => {
      activo = false;
    };
  }, []);

  useEffect(() => {
    const video = cameraVideoRef.current;
    if (!cameraStream || !video) return undefined;

    video.srcObject = cameraStream;
    video.play().catch((error) => {
      console.error("No se pudo iniciar la vista previa de la cámara:", error);
      setCameraError("No se pudo mostrar la cámara. Cierra y vuelve a intentarlo.");
    });

    return () => {
      video.srcObject = null;
      cameraStream.getTracks().forEach((track) => track.stop());
    };
  }, [cameraStream]);

  const abrirCamara = async (target) => {
    setCameraTarget(target);
    setCameraError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Este navegador no permite abrir la cámara. Usa un navegador actualizado y una conexión HTTPS.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: target.facingMode } },
      });
      setCameraStream(stream);
    } catch (error) {
      console.error("No se pudo acceder a la cámara:", error);
      if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
        setCameraError("No se permitió el acceso a la cámara. Autoriza el permiso de cámara en el navegador e inténtalo de nuevo.");
      } else if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
        setCameraError("No se encontró una cámara disponible en este dispositivo.");
      } else {
        setCameraError("No se pudo abrir la cámara. Verifica los permisos y que ninguna otra aplicación la esté usando.");
      }
    }
  };

  const cerrarCamara = () => {
    cameraStream?.getTracks().forEach((track) => track.stop());
    setCameraStream(null);
    setCameraTarget(null);
    setCameraError("");
  };

  const capturarFotografia = () => {
    const video = cameraVideoRef.current;
    if (!video?.videoWidth || !video.videoHeight) {
      setCameraError("La cámara todavía está iniciando. Espera un momento e inténtalo de nuevo.");
      return;
    }

    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1920 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        setCameraError("No se pudo capturar la fotografía. Inténtalo de nuevo.");
        return;
      }
      if (!cameraTarget?.onCapture) {
        setCameraError("No se pudo asociar la foto con el campo seleccionado. Inténtalo de nuevo.");
        return;
      }
      cameraTarget.onCapture(
        new File([blob], `foto-${Date.now()}.jpg`, { type: "image/jpeg" })
      );
      cerrarCamara();
    }, "image/jpeg", 0.9);
  };

  const cedulaYaRegistrada = async (cedula) => {
    const { data, error } = await supabase
      .from("empleados")
      .select("id")
      .eq("cedula", cedula)
      .limit(1);
    if (error) throw error;
    return Boolean(data?.length);
  };

  const manejarCambio = (e) => {
    const { name } = e.target;
    if (name === "cedula") return;
    const value = ["cedula", "cuenta_bancaria"].includes(name)
      ? e.target.value.replace(/\D/g, "")
      : e.target.value;

    setFormulario((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const validarArchivo = (archivo) => {
    if (!archivo) return false;

    const maximo = 5 * 1024 * 1024;

    if (archivo.size > maximo) {
      alert(
        `El archivo "${archivo.name}" supera el tamaño máximo permitido de 5 MB.`
      );
      return false;
    }

    return true;
  };

  const manejarArchivo = (archivo, setter) => {
    if (!archivo) return;

    if (validarArchivo(archivo)) {
      setter(archivo);
    }
  };

  const manejarArchivoFirma = (archivo) => {
    if (!archivo) return;
    if (!["image/jpeg", "image/png"].includes(archivo.type)) {
      alert("La firma debe ser una imagen JPG o PNG.");
      return;
    }
    if (!validarArchivo(archivo)) return;
    setFirma(archivo);
    setArchivoFirmaGuardado("");
    setFirmaReset((previous) => previous + 1);
  };

  const documentoRequiereReemplazo = (clave) => (
    documentosRevision?.[clave]?.estado === "corregir"
  );
  const notaDeRevision = (clave) => (
    documentoRequiereReemplazo(clave) ? documentosRevision[clave].observacion : ""
  );

  const guardarCorrecciones = async (event) => {
    event.preventDefault();
    const pendientes = obtenerDocumentosPorCorregir(documentosRevision);
    const archivos = {
      cedulaFrente,
      cedulaRespaldo,
      certificadoBancario,
      certificadoEPS,
      certificadoPension,
      fotografia,
      firma,
    };
    const faltantes = pendientes.filter(({ clave }) => !archivos[clave]);
    if (faltantes.length) {
      alert(`Debes cargar todos los documentos solicitados: ${faltantes.map(({ etiqueta }) => etiqueta).join(", ")}.`);
      return;
    }

    setGuardando(true);
    setMensajeGuardado("");
    let pasoActual = "iniciar la corrección";
    try {
      const actualizaciones = {};
      for (const { clave, campoUrl, carpeta } of pendientes) {
        pasoActual = `subir ${clave}`;
        actualizaciones[campoUrl] = await subirArchivo(archivos[clave], carpeta, clave);
      }

      const revisionActualizada = limpiarRevisionesDocumentos(
        documentosRevision,
        pendientes.map(({ clave }) => clave)
      );
      pasoActual = "guardar los documentos corregidos";
      const { data, error } = await supabase
        .from("empleados")
        .update({
          ...actualizaciones,
          documentos_revision: revisionActualizada,
        })
        .eq("id", registroEmpleadoId)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("No se encontró el registro para guardar los documentos corregidos.");

      setDocumentosRevision(revisionActualizada);
      setMensajeGuardado("Documentos corregidos y enviados correctamente.");
      onSaved?.();
    } catch (error) {
      console.error("Error guardando documentos corregidos:", error);
      alert(`No se pudieron guardar los documentos corregidos.\n\nPaso: ${pasoActual}\n${error?.message || "Error desconocido."}`);
    } finally {
      setGuardando(false);
    }
  };

  const subirArchivo = async (archivo, carpeta, documento) => {
    if (!archivo) return null;

    const datos = new FormData();
    datos.append("archivo", archivo);
    datos.append("carpeta", carpeta);
    datos.append("documento", documento);
    datos.append("cedula", formulario.cedula);
    datos.append("nombreCompleto", formulario.nombre_completo);

    const respuesta = await fetch(
      `${import.meta.env.VITE_API_URL || ""}/api/archivos`,
      {
        method: "POST",
        body: datos,
      }
    );

    const resultado = await respuesta.json().catch(() => ({}));

    if (!respuesta.ok) {
      throw new Error(
        `Carpeta ${carpeta}: ${resultado.error || `No se pudo subir el archivo a Drive (HTTP ${respuesta.status}).`}`
      );
    }

    return resultado.url;
  };

  const guardarBorrador = async () => {
    if (guardando) return;
    const cedula = formulario.cedula.trim();
    if (!cedula || !formulario.nombre_completo.trim()) {
      alert("No se pudo identificar tu registro. Cierra sesión e ingresa de nuevo con tu cédula autorizada.");
      return;
    }
    if (!aceptaAutorizacion) {
      alert("Debes aceptar la autorización de datos antes de guardar tu avance.");
      return;
    }

    setGuardando(true);
    setMensajeGuardado("");
    let pasoActual = "iniciar el guardado del avance";
    try {
      if (!registroEmpleadoId && await cedulaYaRegistrada(cedula)) {
        alert("Ya existe un formulario registrado con esta cédula. No se puede diligenciar otro.");
        return;
      }
      const archivos = [
        ["cedulaFrente", cedulaFrente, "cedulas"],
        ["cedulaRespaldo", cedulaRespaldo, "cedulas"],
        ["certificadoBancario", certificadoBancario, "certificados-bancarios"],
        ["certificadoEPS", certificadoEPS, "certificados-eps"],
        ["certificadoPension", certificadoPension, "certificados-pension"],
        ["fotografia", fotografia, "fotografias"],
        ["firma", firma, "firmas"],
      ];
      const documentos = { ...documentosGuardados };
      const documentosReemplazados = [];
      for (const [campo, archivo, carpeta] of archivos) {
        if (!archivo) continue;
        pasoActual = `subir ${campo}`;
        documentos[campo] = await subirArchivo(archivo, carpeta, campo);
        documentosReemplazados.push(campo);
      }
      const revisionActualizada = limpiarRevisionesDocumentos(documentosRevision, documentosReemplazados);

      const datosGuardar = {
        ...formulario,
        cedula,
        nombre_completo: formulario.nombre_completo.trim(),
        lugar_expedicion: formulario.lugar_expedicion_municipio || null,
        lugar_nacimiento: formulario.lugar_nacimiento_municipio || null,
        salario_basico: formulario.salario_basico ? Number(formulario.salario_basico) : null,
        auxilio_1: formulario.auxilio_1 ? Number(formulario.auxilio_1) : null,
        auxilio_2: formulario.auxilio_2 ? Number(formulario.auxilio_2) : null,
        bono_productividad: formulario.bono_productividad ? Number(formulario.bono_productividad) : null,
        fecha_nacimiento: formulario.fecha_nacimiento || null,
        fecha_inicio_contrato: formulario.fecha_inicio_contrato || null,
        cedula_frente_url: documentos.cedulaFrente || null,
        cedula_respaldo_url: documentos.cedulaRespaldo || null,
        certificado_bancario_url: documentos.certificadoBancario || null,
        certificado_eps_url: documentos.certificadoEPS || null,
        certificado_pension_url: documentos.certificadoPension || null,
        fotografia_url: documentos.fotografia || null,
        firma_url: documentos.firma || null,
        autorizacion_datos: true,
        documentos_revision: revisionActualizada,
      };

      pasoActual = "guardar el avance en Supabase";
      if (registroEmpleadoId) {
        const { data, error } = await supabase
          .from("empleados")
          .update(datosGuardar)
          .eq("id", registroEmpleadoId)
          .select("id")
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("No se encontró el borrador para actualizar.");
      } else {
        const { data, error } = await supabase
          .from("empleados")
          .insert([datosGuardar])
          .select("id")
          .single();
        if (error) throw error;
        setRegistroEmpleadoId(data.id);
      }

      setDocumentosGuardados(documentos);
      setDocumentosRevision(revisionActualizada);
      setArchivoFirmaGuardado(documentos.firma || "");
      setMensajeGuardado("Avance guardado. Cuando vuelvas a ingresar, podrás continuar desde aquí.");
    } catch (error) {
      const detalle = {
        message: error?.message || "Error desconocido.",
        code: error?.code || null,
        details: error?.details || null,
        hint: error?.hint || null,
      };
      console.error("Error guardando el avance del formulario:", detalle);
      const mensaje = [detalle.message, detalle.details, detalle.hint].filter(Boolean).join("\n");
      const faltaColumna = error?.message?.match(/column ["']?([a-zA-Z0-9_]+)["']? .* does not exist/i)
        || error?.message?.match(/Could not find the ["']([^"']+)["'] column/i);
      const mensajeError = faltaColumna?.[1] === "autorizacion_datos"
        ? `Supabase no reconoce la columna "autorizacion_datos". Ejecuta database/autorizacion-datos.sql en SQL Editor del mismo proyecto y luego recarga la app.`
        : faltaColumna
          ? `Supabase no reconoce la columna "${faltaColumna[1]}". Revisa el esquema de public.empleados y la migración correspondiente en el mismo proyecto.`
          : mensaje;
      alert(`No se pudo guardar tu avance.\n\nPaso: ${pasoActual}\n${mensajeError}`);
    } finally {
      setGuardando(false);
    }
  };

  const guardarInformacion = async (e) => {
    e.preventDefault();

    if (guardando) return;

    if (!aceptaAutorizacion) {
      alert("Debes aceptar la autorización de datos para continuar.");
      return;
    }

    /* ==============================
       VALIDACIÓN DE CAMPOS
    ============================== */

    const camposObligatorios = [
        "cedula",
        "nombre_completo",
        "correo",

        // cargo (3) y proyecto (4) los completa el administrador en el panel

        "lugar_expedicion_departamento",
        "lugar_expedicion_municipio",

        "fecha_nacimiento",

        "lugar_nacimiento_departamento",
        "lugar_nacimiento_municipio",

        "celular",
        "direccion",

        "ciudad_departamento",
        "ciudad_municipio",

        // salario y As (11,12,13,14) los completa el administrador

        "cuenta_bancaria",
        "entidad_financiera",

        "persona_contacto",
        "celular_contacto",
        "parentesco",

        "estado_civil",
        "tipo_sangre",

        "eps",
        "fondo_pension",

        "talla_botas",
        "talla_camisa",
        "talla_pantalon",

        // fecha_inicio_contrato y objeto_contrato los completa el administrador
      ];

    for (const campo of camposObligatorios) {
      if (!formulario[campo]) {
        alert("Por favor complete todos los campos obligatorios.");
        return;
      }
    }

    /* ==============================
       EPS OTRA
    ============================== */

    if (formulario.eps === "OTRA" && !formulario.eps_otra) {
      alert("Escriba el nombre de la EPS.");
      return;
    }

    /* ==============================
       FONDO OTRA
    ============================== */

    if (
      formulario.fondo_pension === "OTRA" &&
      !formulario.fondo_pension_otra
    ) {
      alert("Escriba el nombre del fondo de pensiones.");
      return;
    }

    /* ==============================
       DOCUMENTOS
    ============================== */

    if ((!cedulaFrente && (!documentosGuardados.cedulaFrente || documentoRequiereReemplazo("cedulaFrente")))
      || (!cedulaRespaldo && (!documentosGuardados.cedulaRespaldo || documentoRequiereReemplazo("cedulaRespaldo")))) {
      alert("Debe cargar la cédula por ambos lados.");
      return;
    }

    if (!certificadoBancario && (!documentosGuardados.certificadoBancario || documentoRequiereReemplazo("certificadoBancario"))) {
      alert("Debe cargar el certificado bancario.");
      return;
    }

    if (!certificadoEPS && (!documentosGuardados.certificadoEPS || documentoRequiereReemplazo("certificadoEPS"))) {
      alert("Debe cargar el certificado de EPS.");
      return;
    }

    if (!certificadoPension && (!documentosGuardados.certificadoPension || documentoRequiereReemplazo("certificadoPension"))) {
      alert("Debe cargar el certificado del fondo de pensiones.");
      return;
    }

    if (!fotografia && (!documentosGuardados.fotografia || documentoRequiereReemplazo("fotografia"))) {
      alert("Debe cargar su fotografía.");
      return;
    }

    if (!firma && (!documentosGuardados.firma || documentoRequiereReemplazo("firma"))) {
      alert("Debe dibujar su firma en el recuadro.");
      return;
    }

    let pasoActual = "iniciar el guardado";

    try {
      setGuardando(true);

      if (!registroEmpleadoId && await cedulaYaRegistrada(formulario.cedula.trim())) {
        alert("Ya existe un formulario registrado con esta cédula. No se puede diligenciar otro.");
        return;
      }

      const documentosReemplazados = [];
      const subirDocumento = async (archivo, carpeta, campo) => {
        if (!archivo) return documentosGuardados[campo];
        documentosReemplazados.push(campo);
        return subirArchivo(archivo, carpeta, campo);
      };
      pasoActual = "subir la cédula frontal";
      const cedulaFrenteUrl = await subirDocumento(cedulaFrente, "cedulas", "cedulaFrente");

      pasoActual = "subir la cédula posterior";
      const cedulaRespaldoUrl = await subirDocumento(cedulaRespaldo, "cedulas", "cedulaRespaldo");

      pasoActual = "subir el certificado bancario";
      const certificadoBancarioUrl = await subirDocumento(certificadoBancario, "certificados-bancarios", "certificadoBancario");

      pasoActual = "subir el certificado de EPS";
      const certificadoEPSUrl = await subirDocumento(certificadoEPS, "certificados-eps", "certificadoEPS");

      pasoActual = "subir el certificado de pensión";
      const certificadoPensionUrl = await subirDocumento(certificadoPension, "certificados-pension", "certificadoPension");

      pasoActual = "subir la fotografía";
      const fotografiaUrl = await subirDocumento(fotografia, "fotografias", "fotografia");

      pasoActual = "subir la firma";
      const firmaUrl = await subirDocumento(firma, "firmas", "firma");
      const revisionActualizada = limpiarRevisionesDocumentos(documentosRevision, documentosReemplazados);

      /* ==============================
         DATOS PARA SUPABASE
      ============================== */

      // Normalizar tipos: evitar enviar cadenas vacías a columnas numéricas/fecha
      const datosGuardar = {
        ...formulario,

        // Compatibilidad con las columnas antiguas
        lugar_expedicion: formulario.lugar_expedicion_municipio || null,
        lugar_nacimiento: formulario.lugar_nacimiento_municipio || null,

        // Normalizar números: si viene vacío, enviar null
        salario_basico: formulario.salario_basico ? Number(formulario.salario_basico) : null,
        auxilio_1: formulario.auxilio_1 ? Number(formulario.auxilio_1) : null,
        auxilio_2: formulario.auxilio_2 ? Number(formulario.auxilio_2) : null,
        bono_productividad: formulario.bono_productividad ? Number(formulario.bono_productividad) : null,

        // Fechas: si vacío => null
        fecha_nacimiento: formulario.fecha_nacimiento || null,
        fecha_inicio_contrato: formulario.fecha_inicio_contrato || null,

        // Documentos
        cedula_frente_url: cedulaFrenteUrl || null,
        cedula_respaldo_url: cedulaRespaldoUrl || null,
        certificado_bancario_url: certificadoBancarioUrl || null,
        certificado_eps_url: certificadoEPSUrl || null,
        certificado_pension_url: certificadoPensionUrl || null,
        fotografia_url: fotografiaUrl || null,
        firma_url: firmaUrl || null,
        autorizacion_datos: true,
        documentos_revision: revisionActualizada,
      };

      pasoActual = "guardar la información en Supabase";
      const resultadoGuardado = registroEmpleadoId
        ? await supabase
            .from("empleados")
            .update(datosGuardar)
            .eq("id", registroEmpleadoId)
            .select("id")
            .maybeSingle()
        : await supabase
            .from("empleados")
            .insert([datosGuardar]);
      const { error } = resultadoGuardado;
      if (!error && registroEmpleadoId && !resultadoGuardado.data) {
        throw new Error("No se encontró el borrador para finalizar el formulario.");
      }

      if (error) {
        // Mostrar información más completa del error para depuración
        console.error("Error al guardar:", JSON.stringify(error));

        const mensaje = error?.message || JSON.stringify(error);
        alert("No se pudo guardar la información.\n\n" + mensaje);

        return;
      }

      setDocumentosRevision(revisionActualizada);
      const encabezadosHoja = [
        ...Object.keys(formulario),
        "cedula_frente_url",
        "cedula_respaldo_url",
        "certificado_bancario_url",
        "certificado_eps_url",
        "certificado_pension_url",
        "fotografia_url",
        "firma_url",
      ];
      const valoresHoja = [
        ...Object.values(formulario),
        cedulaFrenteUrl,
        cedulaRespaldoUrl,
        certificadoBancarioUrl,
        certificadoEPSUrl,
        certificadoPensionUrl,
        fotografiaUrl,
        firmaUrl,
      ];

      let mensajeErrorExcel = "";
      try {
        const respuestaHoja = await fetch(
          `${import.meta.env.VITE_API_URL || ""}/api/hoja-empleados`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ encabezados: encabezadosHoja, valores: valoresHoja }),
          }
        );
        const resultadoHoja = await respuestaHoja.json();

        if (!respuestaHoja.ok) {
          throw new Error(resultadoHoja.error || "No se pudo actualizar el archivo Excel.");
        }
      } catch (errorHoja) {
        mensajeErrorExcel = errorHoja?.message || "Error desconocido al actualizar el archivo Excel.";
        console.error("Empleado guardado, pero no se actualizó el archivo Excel:", errorHoja);
      }

      alert(
        !mensajeErrorExcel
          ? "Información guardada correctamente en el sistema y en el archivo Excel."
          : `La información se guardó en el sistema, pero no se pudo actualizar el archivo Excel.\n\nDetalle: ${mensajeErrorExcel}`
      );
      onSaved?.();

      /* ==============================
         LIMPIAR FORMULARIO
      ============================== */

      setFormulario({
        cedula: "",
        nombre_completo: "",
        correo: "",
        cargo: "",
        proyecto: "",

        lugar_expedicion_departamento: "",
        lugar_expedicion_municipio: "",

        fecha_nacimiento: "",

        lugar_nacimiento_departamento: "",
        lugar_nacimiento_municipio: "",

        celular: "",
        direccion: "",

        ciudad_departamento: "",
        ciudad_municipio: "",

        salario_basico: "",
        auxilio_1: "",
        auxilio_2: "",
        bono_productividad: "",

        cuenta_bancaria: "",
        entidad_financiera: "",

        persona_contacto: "",
        celular_contacto: "",
        parentesco: "",

        estado_civil: "",
        tipo_sangre: "",

        eps: "",
        eps_otra: "",

        fondo_pension: "",
        fondo_pension_otra: "",

        talla_botas: "",
        talla_camisa: "",
        talla_pantalon: "",

        fecha_inicio_contrato: "",
        objeto_contrato: "",
      });

      setCedulaFrente(null);
      setCedulaRespaldo(null);
      setCertificadoBancario(null);
      setCertificadoEPS(null);
      setCertificadoPension(null);
      setFotografia(null);
      setFirma(null);
      setFirmaReset((previous) => previous + 1);

    } catch (error) {
      console.error(error);

      alert(
        `Ocurrió un error al guardar la información.\n\nPaso: ${pasoActual}\n${error?.message || "Error desconocido"}`
      );
    } finally {
      setGuardando(false);
    }
  };

  if (correctionOnly) {
    const archivosCorreccion = {
      cedulaFrente: { archivo: cedulaFrente, setter: setCedulaFrente, accept: ".pdf,.jpg,.jpeg,.png" },
      cedulaRespaldo: { archivo: cedulaRespaldo, setter: setCedulaRespaldo, accept: ".pdf,.jpg,.jpeg,.png" },
      certificadoBancario: { archivo: certificadoBancario, setter: setCertificadoBancario, accept: ".pdf,.jpg,.jpeg,.png" },
      certificadoEPS: { archivo: certificadoEPS, setter: setCertificadoEPS, accept: ".pdf,.jpg,.jpeg,.png" },
      certificadoPension: { archivo: certificadoPension, setter: setCertificadoPension, accept: ".pdf,.jpg,.jpeg,.png" },
      fotografia: { archivo: fotografia, setter: setFotografia, accept: ".jpg,.jpeg,.png,image/jpeg,image/png" },
      firma: { archivo: firma, setter: manejarArchivoFirma, accept: ".jpg,.jpeg,.png,image/jpeg,image/png" },
    };
    const documentosPendientes = obtenerDocumentosPorCorregir(documentosRevision);

    return (
      <div className="employee-form-page" style={pageStyle}>
        <div className="employee-form-container" style={containerStyle}>
          <div className="employee-form-header" style={headerStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: "18px", flexWrap: "wrap" }}>
              <img src={logoRD} alt="Logo RD Soluciones" style={{ width: "72px", height: "72px", objectFit: "contain", borderRadius: "18px" }} />
              <div>
                <h2 style={headerTitle}>Corrección de documentos</h2>
                <p style={headerSubtitle}>Carga únicamente los documentos que administración te solicitó corregir.</p>
              </div>
            </div>
          </div>
          {cargandoBorrador ? (
            <p role="status" style={helpStyle}>Cargando las observaciones...</p>
          ) : !registroEmpleadoId ? (
            <p role="alert" style={{ ...helpStyle, color: "#B71C1C" }}>
              No se pudo cargar el registro para corregir los documentos. Cierra sesión e inténtalo nuevamente.
            </p>
          ) : (
            <>
              {mensajeGuardado && (
                <p role="status" style={{ ...helpStyle, color: "#2E7D32" }}>{mensajeGuardado}</p>
              )}
              {documentosPendientes.length === 0 ? (
                <p role="status" style={helpStyle}>No hay documentos pendientes de corrección.</p>
              ) : (
                <form onSubmit={guardarCorrecciones} style={{ padding: "20px" }}>
                  <div style={{ display: "grid", gap: "12px" }}>
                    {documentosPendientes.map(({ clave, etiqueta }) => {
                      const configuracion = archivosCorreccion[clave];
                      return (
                        <section key={clave} style={{ padding: "14px", border: "1px solid #F3C77B", background: "#FFF9F0", borderRadius: "8px" }}>
                          <h3 style={{ margin: "0 0 6px", color: "#263238" }}>{etiqueta}</h3>
                          <p role="alert" style={{ ...helpStyle, margin: "0 0 10px", color: "#8A4B08" }}>
                            <strong>Observación:</strong> {notaDeRevision(clave)}
                          </p>
                          {clave === "firma" && (
                            <>
                              <p style={helpStyle}>Dibuja tu firma nueva o carga una imagen JPG o PNG.</p>
                              <SignaturePad key={firmaReset} onChange={setFirma} />
                            </>
                          )}
                          <FileInput
                            label={clave === "firma" ? "Cargar imagen de la firma corregida" : `Cargar ${etiqueta.toLowerCase()} corregido`}
                            accept={configuracion.accept}
                            required={clave !== "firma"}
                            selectedFile={configuracion.archivo?.name}
                            help="Tamaño máximo 5 MB."
                            onChange={(event) => {
                              if (clave === "firma") {
                                manejarArchivoFirma(event.target.files?.[0]);
                                event.target.value = "";
                              } else {
                                manejarArchivo(event.target.files?.[0], configuracion.setter);
                              }
                            }}
                          />
                        </section>
                      );
                    })}
                  </div>
                  <button
                    type="submit"
                    disabled={guardando}
                    style={{ padding: "12px 20px", border: 0, borderRadius: "8px", background: guardando ? "#8295A0" : "#3187B5", color: "#FFFFFF", fontWeight: 700, cursor: guardando ? "wait" : "pointer" }}
                  >
                    {guardando ? "GUARDANDO..." : "ENVIAR DOCUMENTOS CORREGIDOS"}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="employee-form-page" style={pageStyle}>

      <div className="employee-form-container" style={containerStyle}>
        {(cameraStream || cameraError) && (
          <div style={cameraOverlayStyle}>
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="cameraTitle"
              style={cameraDialogStyle}
            >
              <h3 id="cameraTitle" style={cameraTitleStyle}>
                Tomar foto{cameraTarget?.label ? `: ${cameraTarget.label}` : ""}
              </h3>
              {cameraStream && (
                <video
                  ref={cameraVideoRef}
                  autoPlay
                  playsInline
                  muted
                  style={cameraPreviewStyle}
                />
              )}
              {cameraError && <p role="alert" style={cameraErrorStyle}>{cameraError}</p>}
              <div style={cameraActionsStyle}>
                <button type="button" onClick={cerrarCamara} style={cameraCancelButtonStyle}>
                  Cancelar
                </button>
                {cameraStream ? (
                  <button type="button" onClick={capturarFotografia} style={cameraCaptureButtonStyle}>
                    Capturar foto
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void abrirCamara(cameraTarget)}
                    style={cameraCaptureButtonStyle}
                  >
                    Intentar de nuevo
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ENCABEZADO */}

        <div className="employee-form-header" style={headerStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: "18px", flexWrap: "wrap" }}>
            <img
              src={logoRD}
              alt="Logo RD Soluciones"
              style={{
                width: "72px",
                height: "72px",
                objectFit: "contain",
                borderRadius: "18px",
                background: "rgba(255,255,255,0.15)",
                border: "1px solid rgba(255,255,255,0.4)",
                boxShadow: "0 10px 25px rgba(0,0,0,0.12)",
                padding: "4px",
              }}
            />

            <div>
              <h2 style={headerTitle}>
                RD Soluciones
              </h2>

              <p style={headerSubtitle}>
                Registro de información
              </p>

              <p style={{ ...headerSubtitle, marginTop: "6px" }}>
                Complete todos los campos solicitados
              </p>
            </div>
          </div>
        </div>

        <form
          className="employee-form"
          onSubmit={guardarInformacion}
          style={formStyle}
        >
          {cargandoBorrador && (
            <p role="status" style={{ ...helpStyle, margin: "0 0 16px" }}>
              Revisando si tienes un avance guardado...
            </p>
          )}
          {mensajeGuardado && (
            <p role="status" style={{
              ...helpStyle,
              margin: "0 0 16px",
              color: obtenerDocumentosPorCorregir(documentosRevision).length ? "#8A4B08" : "#2E7D32",
            }}>
              {mensajeGuardado}
            </p>
          )}
          {obtenerDocumentosPorCorregir(documentosRevision).length > 0 && (
            <section
              role="alert"
              style={{ marginBottom: "20px", padding: "14px", background: "#FFF4E5", border: "1px solid #F3C77B", borderRadius: "8px" }}
            >
              <strong style={{ color: "#8A4B08" }}>Documentos que debes corregir</strong>
              <ul style={{ margin: "8px 0 0", paddingLeft: "22px", color: "#6D4C1E" }}>
                {obtenerDocumentosPorCorregir(documentosRevision).map(({ clave, etiqueta }) => (
                  <li key={clave}>
                    <strong>{etiqueta}:</strong> {notaDeRevision(clave)}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {Object.entries(documentosGuardados).some(([, url]) => url) && (
            <section style={{ marginBottom: "20px", padding: "14px", background: "#F1F8E9", borderRadius: "8px" }}>
              <strong style={{ color: "#33691E" }}>Documentos conservados en tu avance:</strong>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", marginTop: "8px" }}>
                {[
                  ["cedulaFrente", "Cédula - frente"],
                  ["cedulaRespaldo", "Cédula - respaldo"],
                  ["certificadoBancario", "Certificado bancario"],
                  ["certificadoEPS", "Certificado EPS"],
                  ["certificadoPension", "Certificado de pensiones"],
                  ["fotografia", "Fotografía"],
                  ["firma", "Firma"],
                ].filter(([campo]) => documentosGuardados[campo]).map(([campo, etiqueta]) => (
                  <a key={campo} href={documentosGuardados[campo]} target="_blank" rel="noreferrer" style={{ color: "#3187B5" }}>
                    Ver {etiqueta}
                  </a>
                ))}
              </div>
            </section>
          )}

          <div style={autorizacionStyle}>
            <label style={autorizacionLabelStyle}>
              <input
                type="checkbox"
                checked={aceptaAutorizacion}
                onChange={(e) => setAceptaAutorizacion(e.target.checked)}
                style={autorizacionCheckboxStyle}
              />
              <span>
                <strong>AUTORIZACIÓN DE DATOS:</strong>{" "}
                Declaro que ACEPTO y AUTORIZO al Consorcio RD para recolectar,
                almacenar y tratar mis datos personales, incluidos los datos
                sensibles que sean necesarios para el proceso de vinculación y
                gestión laboral, de conformidad con la Ley 1581 de 2012 y demás
                normas aplicables. Entiendo que el suministro de datos sensibles
                es facultativo, salvo cuando exista obligación legal.
              </span>
            </label>
          </div>

          {/* =================================
              1. CÉDULA
          ================================= */}

          <SectionTitle
            numero="1"
            titulo="Cédula"
          />

          <div className="employee-form-grid" style={gridStyle}>

            <div style={{ marginBottom: "18px" }}>
              <label style={labelStyle}>Número de cédula</label>
              <input
                type="text"
                name="cedula"
                inputMode="numeric"
                pattern="[0-9]*"
                value={formulario.cedula}
                onChange={manejarCambio}
                readOnly
                title="Tu cédula está asociada a tu ingreso y no se puede cambiar"
                placeholder="Ingrese el número de cédula"
                required
                style={{ ...inputStyle, background: "#EEF1F3", cursor: "not-allowed" }}
              />
            </div>

            <FileInput
              label="Cédula - Frente"
              accept=".pdf,.jpg,.jpeg,.png"
              required={!documentosGuardados.cedulaFrente || documentoRequiereReemplazo("cedulaFrente")}
              correctionNote={notaDeRevision("cedulaFrente")}
              savedUrl={documentosGuardados.cedulaFrente}
              selectedFile={cedulaFrente?.name}
              help="Cargue el frente de su Cédula. Tamaño máximo 5 MB."
              onTakePhoto={() => void abrirCamara({
                label: "Cédula - Frente",
                facingMode: "environment",
                onCapture: (archivo) => manejarArchivo(archivo, setCedulaFrente),
              })}
              onChange={(e) =>
                manejarArchivo(
                  e.target.files[0],
                  setCedulaFrente
                )
              }
            />

            <FileInput
              label="Cédula - Respaldo"
              accept=".pdf,.jpg,.jpeg,.png"
              required={!documentosGuardados.cedulaRespaldo || documentoRequiereReemplazo("cedulaRespaldo")}
              correctionNote={notaDeRevision("cedulaRespaldo")}
              savedUrl={documentosGuardados.cedulaRespaldo}
              selectedFile={cedulaRespaldo?.name}
              help="Cargue el respaldo de su Cédula. Tamaño máximo 5 MB."
              onTakePhoto={() => void abrirCamara({
                label: "Cédula - Respaldo",
                facingMode: "environment",
                onCapture: (archivo) => manejarArchivo(archivo, setCedulaRespaldo),
              })}
              onChange={(e) =>
                manejarArchivo(
                  e.target.files[0],
                  setCedulaRespaldo
                )
              }
            />

          </div>


          {/* =================================
              2. NOMBRES
          ================================= */}

          <SectionTitle
            numero="2"
            titulo="Nombres y Apellidos"
          />

          <Input
            label="Nombres y Apellidos"
            name="nombre_completo"
            value={formulario.nombre_completo}
            onChange={manejarCambio}
            placeholder="Ingrese sus nombres y apellidos"
            required
          />

          <Input
            label="Correo electrónico"
            name="correo"
            type="email"
            value={formulario.correo}
            onChange={manejarCambio}
            placeholder="Ingrese su correo electrónico"
            required
          />


          {/* =================================
              3. CARGO
          ================================= */}

          <SectionTitle
            numero="3"
            titulo="Cargo"
          />

          <Input
            label="Cargo"
            name="cargo"
            value={formulario.cargo}
            onChange={manejarCambio}
            placeholder="Ingrese su cargo"
            required
            readOnly={true}
          />


          {/* =================================
              4. PROYECTO
          ================================= */}

          <SectionTitle
            numero="4"
            titulo="Proyecto"
          />

          <Input
            label="Proyecto"
            name="proyecto"
            value={formulario.proyecto}
            onChange={manejarCambio}
            placeholder="Ingrese el proyecto"
            required
            readOnly={true}
          />


          {/* =================================
              5. EXPEDICIÓN
          ================================= */}

          <SectionTitle
            numero="5"
            titulo="Ciudad de Expedición de la Cédula"
          />

          <div className="employee-form-grid" style={gridStyle}>

            <Input
              label="Departamento"
              name="lugar_expedicion_departamento"
              value={
                formulario.lugar_expedicion_departamento
              }
              onChange={manejarCambio}
              placeholder="Escriba el departamento"
              required
            />

            <Input
              label="Municipio / Ciudad"
              name="lugar_expedicion_municipio"
              value={
                formulario.lugar_expedicion_municipio
              }
              onChange={manejarCambio}
              placeholder="Escriba el municipio"
              required
            />

          </div>


          {/* =================================
              6. FECHA NACIMIENTO
          ================================= */}

          <SectionTitle
            numero="6"
            titulo="Fecha de nacimiento"
          />

          <Input
            label="Fecha de nacimiento"
            type="date"
            name="fecha_nacimiento"
            value={formulario.fecha_nacimiento}
            onChange={manejarCambio}
            required
          />


          {/* =================================
              7. LUGAR NACIMIENTO
          ================================= */}

          <SectionTitle
            numero="7"
            titulo="Lugar de nacimiento"
          />

          <div className="employee-form-grid" style={gridStyle}>

            <Input
              label="Departamento"
              name="lugar_nacimiento_departamento"
              value={
                formulario.lugar_nacimiento_departamento
              }
              onChange={manejarCambio}
              placeholder="Escriba el departamento"
              required
            />

            <Input
              label="Municipio / Ciudad"
              name="lugar_nacimiento_municipio"
              value={
                formulario.lugar_nacimiento_municipio
              }
              onChange={manejarCambio}
              placeholder="Escriba el municipio"
              required
            />

          </div>


          {/* =================================
              8. CONTACTO
          ================================= */}

          <SectionTitle
            numero="8"
            titulo="No. Contacto"
          />

          <Input
            label="No. Contacto"
            name="celular"
            type="tel"
            value={formulario.celular}
            onChange={manejarCambio}
            placeholder="Ingrese su número de contacto"
            required
          />


          {/* =================================
              9. DIRECCIÓN
          ================================= */}

          <SectionTitle
            numero="9"
            titulo="Dirección"
          />

          <Input
            label="Dirección"
            name="direccion"
            value={formulario.direccion}
            onChange={manejarCambio}
            placeholder="Ingrese su dirección"
            required
          />


          {/* =================================
              10. CIUDAD
          ================================= */}

          <SectionTitle
            numero="10"
            titulo="Ciudad"
          />

          <div className="employee-form-grid" style={gridStyle}>

            <Input
              label="Departamento"
              name="ciudad_departamento"
              value={formulario.ciudad_departamento}
              onChange={manejarCambio}
              placeholder="Escriba el departamento"
              required
            />

            <Input
              label="Municipio / Ciudad"
              name="ciudad_municipio"
              value={formulario.ciudad_municipio}
              onChange={manejarCambio}
              placeholder="Escriba el municipio"
              required
            />

          </div>


          {/* =================================
              11. SALARIO
          ================================= */}

          <SectionTitle
            numero="11"
            titulo="Salario Básico"
          />

          <Input
            label="Salario Básico"
            name="salario_basico"
            type="number"
            value={formulario.salario_basico}
            onChange={manejarCambio}
            placeholder="Ingrese el salario básico"
            required
            readOnly={true}
          />


          {/* =================================
              12. AUXILIO 1
          ================================= */}

          <SectionTitle
            numero="12"
            titulo="Auxilio De Alimentación"
          />

          <Input
            label="Auxilio 1"
            name="auxilio_1"
            type="number"
            value={formulario.auxilio_1}
            onChange={manejarCambio}
            placeholder="Ingrese el valor"
            required
            readOnly={true}
          />


          {/* =================================
              13. AUXILIO 2
          ================================= */}

          <SectionTitle
            numero="13"
            titulo="Auxilio De Vivienda"
          />

          <Input
            label="Auxilio De Vivienda"
            name="auxilio_2"
            type="number"
            value={formulario.auxilio_2}
            onChange={manejarCambio}
            placeholder="Ingrese el valor"
            required
            readOnly={true}
          />


          {/* =================================
              14. BONO
          ================================= */}

          <SectionTitle
            numero="14"
            titulo="Bono de Productividad"
          />

          <Input
            label="Bono de Productividad"
            name="bono_productividad"
            type="number"
            value={formulario.bono_productividad}
            onChange={manejarCambio}
            placeholder="Ingrese el valor"
            required
            readOnly={true}
          />


          {/* =================================
              15. CUENTA
          ================================= */}

          <SectionTitle
            numero="15"
            titulo="# Cta Bancaria"
          />

          <Input
            label="Número de Cuenta Bancaria"
            name="cuenta_bancaria"
            inputMode="numeric"
            pattern="[0-9]*"
            value={formulario.cuenta_bancaria}
            onChange={manejarCambio}
            placeholder="Ingrese el número de cuenta"
            required
          />


          {/* =================================
              16. BANCO
          ================================= */}

          <SectionTitle
            numero="16"
            titulo="Entidad Financiera"
          />

          <Input
            label="Entidad Financiera"
            name="entidad_financiera"
            value={formulario.entidad_financiera}
            onChange={manejarCambio}
            placeholder="Ejemplo: Bancolombia"
            required
          />

          <FileInput
            label="Certificado Bancario"
            accept=".pdf,.jpg,.jpeg,.png"
            required={!documentosGuardados.certificadoBancario || documentoRequiereReemplazo("certificadoBancario")}
            correctionNote={notaDeRevision("certificadoBancario")}
            savedUrl={documentosGuardados.certificadoBancario}
            selectedFile={certificadoBancario?.name}
            help="Cargue el certificado bancario. Tamaño máximo 5 MB."
            onTakePhoto={() => void abrirCamara({
              label: "Certificado Bancario",
              facingMode: "environment",
              onCapture: (archivo) => manejarArchivo(archivo, setCertificadoBancario),
            })}
            onChange={(e) =>
              manejarArchivo(
                e.target.files[0],
                setCertificadoBancario
              )
            }
          />


          {/* =================================
              17. CONTACTO
          ================================= */}

          <SectionTitle
            numero="17"
            titulo="Persona de Contacto"
          />

          <Input
            label="Persona de Contacto"
            name="persona_contacto"
            value={formulario.persona_contacto}
            onChange={manejarCambio}
            placeholder="Nombre completo"
            required
          />


          {/* =================================
              18. CELULAR CONTACTO
          ================================= */}

          <SectionTitle
            numero="18"
            titulo="Celular de Contacto"
          />

          <Input
            label="Celular de Contacto"
            name="celular_contacto"
            type="tel"
            value={formulario.celular_contacto}
            onChange={manejarCambio}
            placeholder="Número de celular"
            required
          />


          {/* =================================
              19. PARENTESCO
          ================================= */}

          <SectionTitle
            numero="19"
            titulo="Parentesco"
          />

          <Select
            label="Parentesco"
            name="parentesco"
            value={formulario.parentesco}
            onChange={manejarCambio}
            options={[
              "Padre",
              "Madre",
              "Esposo(a)",
              "Compañero(a)",
              "Hijo(a)",
              "Hermano(a)",
              "Abuelo(a)",
              "Abuela(a)",
              "Tío(a)",
              "Primo(a)",
              "Otro",
            ]}
          />


          {/* =================================
              20. ESTADO CIVIL
          ================================= */}

          <SectionTitle
            numero="20"
            titulo="Estado Civil"
          />

          <Select
            label="Estado Civil"
            name="estado_civil"
            value={formulario.estado_civil}
            onChange={manejarCambio}
            options={[
              "Soltero(a)",
              "Casado(a)",
              "Unión libre",
              "Separado(a)",
              "Divorciado(a)",
              "Viudo(a)",
            ]}
          />


          {/* =================================
              21. SANGRE
          ================================= */}

          <SectionTitle
            numero="21"
            titulo="Tipo de Sangre"
          />

          <Select
            label="Tipo de Sangre"
            name="tipo_sangre"
            value={formulario.tipo_sangre}
            onChange={manejarCambio}
            options={[
              "O+",
              "O-",
              "A+",
              "A-",
              "B+",
              "B-",
              "AB+",
              "AB-",
            ]}
          />


          {/* =================================
              22. EPS
          ================================= */}

          <SectionTitle
            numero="22"
            titulo="EPS"
          />

          <Select
            label="EPS"
            name="eps"
            value={formulario.eps}
            onChange={manejarCambio}
            options={[
              "Aliansalud",
              "Asmet Salud",
              "Capital Salud",
              "Compensar",
              "Coosalud",
              "Emssanar",
              "Famisanar",
              "Nueva EPS",
              "Salud Total",
              "Sanitas",
              "Savia Salud",
              "SURA",
              "Mutual SER",
              "OTRA",
            ]}
          />

          {formulario.eps === "OTRA" && (
            <Input
              label="Nombre de la EPS"
              name="eps_otra"
              value={formulario.eps_otra}
              onChange={manejarCambio}
              placeholder="Escriba el nombre de la EPS"
              required
            />
          )}

          <FileInput
            label="Certificado de EPS"
            accept=".pdf,.jpg,.jpeg,.png"
            required={!documentosGuardados.certificadoEPS || documentoRequiereReemplazo("certificadoEPS")}
            correctionNote={notaDeRevision("certificadoEPS")}
            savedUrl={documentosGuardados.certificadoEPS}
            selectedFile={certificadoEPS?.name}
            help="Cargue su certificado de EPS. Tamaño máximo 5 MB."
            onTakePhoto={() => void abrirCamara({
              label: "Certificado de EPS",
              facingMode: "environment",
              onCapture: (archivo) => manejarArchivo(archivo, setCertificadoEPS),
            })}
            onChange={(e) =>
              manejarArchivo(
                e.target.files[0],
                setCertificadoEPS
              )
            }
          />


          {/* =================================
              23. PENSIÓN
          ================================= */}

          <SectionTitle
            numero="23"
            titulo="Fondo de Pensiones"
          />

          <Select
            label="Fondo de Pensiones"
            name="fondo_pension"
            value={formulario.fondo_pension}
            onChange={manejarCambio}
            options={[
              "Colpensiones",
              "Porvenir",
              "Protección",
              "Skandia",
              "Colfondos",
              "OTRA",
            ]}
          />

          {formulario.fondo_pension === "OTRA" && (
            <Input
              label="Nombre del Fondo de Pensiones"
              name="fondo_pension_otra"
              value={formulario.fondo_pension_otra}
              onChange={manejarCambio}
              placeholder="Escriba el nombre"
              required
            />
          )}

          <FileInput
            label="Certificado del Fondo de Pensiones"
            accept=".pdf,.jpg,.jpeg,.png"
            required={!documentosGuardados.certificadoPension || documentoRequiereReemplazo("certificadoPension")}
            correctionNote={notaDeRevision("certificadoPension")}
            savedUrl={documentosGuardados.certificadoPension}
            selectedFile={certificadoPension?.name}
            help="Cargue su certificado. Tamaño máximo 5 MB."
            onTakePhoto={() => void abrirCamara({
              label: "Certificado del Fondo de Pensiones",
              facingMode: "environment",
              onCapture: (archivo) => manejarArchivo(archivo, setCertificadoPension),
            })}
            onChange={(e) =>
              manejarArchivo(
                e.target.files[0],
                setCertificadoPension
              )
            }
          />


          {/* =================================
              24. BOTAS
          ================================= */}

          <SectionTitle
            numero="24"
            titulo="Talla Botas"
          />

          <Select
            label="Talla Botas"
            name="talla_botas"
            value={formulario.talla_botas}
            onChange={manejarCambio}
            options={[
              "35",
              "36",
              "37",
              "38",
              "39",
              "40",
              "41",
              "42",
              "43",
              "44",
              "45",
            ]}
          />


          {/* =================================
              25. CAMISA
          ================================= */}

          <SectionTitle
            numero="25"
            titulo="Talla Camisa"
          />

          <Select
            label="Talla Camisa"
            name="talla_camisa"
            value={formulario.talla_camisa}
            onChange={manejarCambio}
            options={[
              "XS",
              "S",
              "M",
              "L",
              "XL",
              "XXL",
            ]}
          />


          {/* =================================
              26. PANTALÓN
          ================================= */}

          <SectionTitle
            numero="26"
            titulo="Talla Pantalón"
          />

          <Select
            label="Talla Pantalón"
            name="talla_pantalon"
            value={formulario.talla_pantalon}
            onChange={manejarCambio}
            options={[
              "28",
              "30",
              "32",
              "34",
              "36",
              "38",
              "40",
              "42",
              "44",
            ]}
          />


          {/* =================================
              27. FOTOGRAFÍA
          ================================= */}

          <SectionTitle
            numero="27"
            titulo="Cargue Fotografía"
          />

          <FileInput
            label="Fotografía"
            accept=".jpg,.jpeg,.png,image/jpeg,image/png"
            required={!documentosGuardados.fotografia || documentoRequiereReemplazo("fotografia")}
            correctionNote={notaDeRevision("fotografia")}
            savedUrl={documentosGuardados.fotografia}
            selectedFile={fotografia?.name}
            help="Tome una foto con la cámara o seleccione una imagen. Máximo 5 MB."
            onTakePhoto={() => void abrirCamara({
              label: "Fotografía",
              facingMode: "user",
              onCapture: (archivo) => manejarArchivo(archivo, setFotografia),
            })}
            onChange={(e) =>
              manejarArchivo(e.target.files[0], setFotografia)
            }
          />

          {/* =================================
              28. FIRMA
          ================================= */}

          <SectionTitle
            numero="28"
            titulo="Cargue su Firma"
          />

          <p style={helpStyle}>
            Puedes dibujar tu firma en el recuadro o cargar una imagen de tu firma en JPG o PNG.
          </p>
          <SignaturePad
            key={firmaReset}
            onChange={setFirma}
          />
          {notaDeRevision("firma") && (
            <p role="alert" style={{ ...helpStyle, color: "#8A4B08", background: "#FFF4E5", padding: "10px", borderRadius: "6px" }}>
              <strong>Debes corregir la firma:</strong> {notaDeRevision("firma")} Carga o dibuja una firma nueva.
            </p>
          )}
          <FileInput
            label="O cargar imagen de la firma"
            accept=".jpg,.jpeg,.png,image/jpeg,image/png"
            selectedFile={firma?.name}
            help="Imagen JPG o PNG, máximo 5 MB."
            onTakePhoto={() => void abrirCamara({
              label: "Firma",
              facingMode: "environment",
              onCapture: manejarArchivoFirma,
            })}
            onChange={(event) => {
              manejarArchivoFirma(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          {firma && (
            <small style={selectedFileStyle}>Firma seleccionada: {firma.name}</small>
          )}
          {!firma && archivoFirmaGuardado && (
            <small style={selectedFileStyle}>Firma guardada: puedes conservarla o cargar/dibujar otra.</small>
          )}


          {/* =================================
              29. INICIO CONTRATO
          ================================= */}

          <SectionTitle
            numero="29"
            titulo="Fecha de Inicio Contrato"
          />

          <Input
            label="Fecha de Inicio Contrato"
            type="date"
            name="fecha_inicio_contrato"
            value={formulario.fecha_inicio_contrato}
            onChange={manejarCambio}
            required
            readOnly={true}
          />


          {/* =================================
              29. OBJETO
          ================================= */}

          <SectionTitle
            numero="29"
            titulo="Objeto de Contrato"
          />

          <div style={{ marginBottom: "20px" }}>

            <label style={labelStyle}>
              Objeto de Contrato
              <span style={requiredStyle}> *</span>
            </label>

            <textarea
              name="objeto_contrato"
              value={formulario.objeto_contrato}
              onChange={manejarCambio}
              placeholder="Este campo lo completa el administrador"
              readOnly
              style={textareaStyle}
            />

          </div>

          {/* =================================
              BOTÓN
          ================================= */}

          <div style={buttonContainerStyle}>

            <button
              type="button"
              onClick={() => void guardarBorrador()}
              disabled={guardando || cargandoBorrador}
              style={{
                ...buttonStyle,
                background: guardando || cargandoBorrador ? "#90A4AE" : "#6BAA45",
                cursor: guardando || cargandoBorrador ? "not-allowed" : "pointer",
              }}
            >
              {guardando ? "GUARDANDO..." : "GUARDAR AVANCE"}
            </button>

            <button
              type="submit"
              disabled={guardando || cargandoBorrador}
              style={{
                ...buttonStyle,
                background: guardando || cargandoBorrador
                  ? "#90A4AE"
                  : "#3187B5",
                cursor: guardando || cargandoBorrador
                  ? "not-allowed"
                  : "pointer",
              }}
            >
              {guardando
                ? "GUARDANDO..."
                : "FINALIZAR Y ENVIAR"}
            </button>

          </div>

        </form>

        <div style={footerStyle} />

      </div>

    </div>
  );
}


/* =========================================
   COMPONENTE INPUT
========================================= */

function Input({
  label,
  name,
  value,
  onChange,
  type = "text",
  inputMode,
  pattern,
  placeholder = "",
  required = false,
  readOnly = false,
  disabled = false,
}) {
  return (
    <div style={{ marginBottom: "18px" }}>

      <label style={labelStyle}>
        {label}

        {required && !disabled && (
          <span style={requiredStyle}> *</span>
        )}
      </label>

      <input
        type={type}
        name={name}
        inputMode={inputMode}
        pattern={pattern}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required && !disabled && !readOnly}
        style={{
          ...inputStyle,
          background: readOnly || disabled ? "#F1F3F4" : inputStyle.background,
        }}
        readOnly={readOnly}
        disabled={disabled}
      />

    </div>
  );
}


/* =========================================
   COMPONENTE SELECT
========================================= */

function Select({
  label,
  name,
  value,
  onChange,
  options,
  disabled = false,
}) {
  return (
    <div style={{ marginBottom: "18px" }}>

      <label style={labelStyle}>
        {label}

        {!disabled && <span style={requiredStyle}> *</span>}
      </label>

      <select
        name={name}
        value={value}
        onChange={onChange}
        required={!disabled}
        style={{
          ...inputStyle,
          background: disabled ? "#F1F3F4" : inputStyle.background,
        }}
        disabled={disabled}
      >

        <option value="">
          Seleccione una opción
        </option>

        {options.map((opcion) => (
          <option
            key={opcion}
            value={opcion}
          >
            {opcion}
          </option>
        ))}

      </select>

    </div>
  );
}


/* =========================================
   COMPONENTE ARCHIVO
========================================= */

function FileInput({
  label,
  onChange,
  onTakePhoto,
  accept,
  capture,
  help,
  required = false,
  correctionNote = "",
  savedUrl,
  selectedFile,
}) {
  return (
    <div style={{ marginBottom: "20px" }}>

      <label style={labelStyle}>

        {label}

        {required && (
          <span style={requiredStyle}> *</span>
        )}

      </label>

      <input
        type="file"
        accept={accept}
        capture={capture}
        onChange={onChange}
        required={required && !selectedFile}
        style={fileInputStyle}
      />

      {onTakePhoto && (
        <button
          type="button"
          onClick={onTakePhoto}
          style={{ ...mediaButtonStyle, marginTop: "8px" }}
        >
          Tomar foto
        </button>
      )}

      {selectedFile && (
        <small style={selectedFileStyle}>Archivo listo: {selectedFile}</small>
      )}

      {help && (
        <small style={helpStyle}>
          {help}
        </small>
      )}
      {savedUrl && (
        <small style={{ ...helpStyle, display: "block", color: "#2E7D32" }}>
          {correctionNote
            ? "Este documento debe reemplazarse."
            : "Documento guardado. Si lo reemplazas, selecciona el nuevo archivo."}
        </small>
      )}
      {correctionNote && (
        <small role="alert" style={{ ...helpStyle, display: "block", color: "#8A4B08", fontWeight: 700 }}>
          Observación de administración: {correctionNote}
        </small>
      )}

    </div>
  );
}

function SignaturePad({ onChange }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const hasSignatureRef = useRef(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");

  const updatePreview = (blob) => {
    setPreviewUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return blob ? URL.createObjectURL(blob) : "";
    });
  };

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const getPoint = (event) => {
    const canvas = canvasRef.current;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) * (canvas.width / bounds.width),
      y: (event.clientY - bounds.top) * (canvas.height / bounds.height),
    };
  };

  const startDrawing = (event) => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    const point = getPoint(event);
    canvas.setPointerCapture(event.pointerId);
    context.beginPath();
    context.strokeStyle = "#111111";
    context.lineWidth = 5;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.moveTo(point.x, point.y);
    drawingRef.current = true;
  };

  const draw = (event) => {
    if (!drawingRef.current) return;
    const context = canvasRef.current.getContext("2d");
    const point = getPoint(event);
    context.lineTo(point.x, point.y);
    context.stroke();
    if (!hasSignatureRef.current) {
      hasSignatureRef.current = true;
      setHasSignature(true);
    }
  };

  const finishDrawing = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (!hasSignatureRef.current) return;

    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        if (pixels.data[(y * canvas.width + x) * 4 + 3] > 16) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }
    if (maxX < minX || maxY < minY) return;

    const padding = 12;
    const cropX = Math.max(0, minX - padding);
    const cropY = Math.max(0, minY - padding);
    const cropRight = Math.min(canvas.width, maxX + padding + 1);
    const cropBottom = Math.min(canvas.height, maxY + padding + 1);
    const croppedCanvas = document.createElement("canvas");
    croppedCanvas.width = cropRight - cropX;
    croppedCanvas.height = cropBottom - cropY;
    croppedCanvas.getContext("2d").drawImage(
      canvas,
      cropX,
      cropY,
      croppedCanvas.width,
      croppedCanvas.height,
      0,
      0,
      croppedCanvas.width,
      croppedCanvas.height
    );

    croppedCanvas.toBlob((blob) => {
      if (!blob) {
        updatePreview(null);
        onChange(null);
        return;
      }
      updatePreview(blob);
      onChange(new File([blob], "firma.png", { type: "image/png" }));
    }, "image/png");
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    drawingRef.current = false;
    hasSignatureRef.current = false;
    setHasSignature(false);
    updatePreview(null);
    onChange(null);
  };

  return (
    <div style={signatureFieldStyle}>
      <label style={labelStyle}>
        Firma <span style={requiredStyle}>*</span>
      </label>
      <p style={helpStyle}>Firme dentro del recuadro con el dedo o el mouse.</p>
      <canvas
        ref={canvasRef}
        width={900}
        height={240}
        aria-label="Área para dibujar la firma"
        onPointerDown={startDrawing}
        onPointerMove={draw}
        onPointerUp={finishDrawing}
        onPointerCancel={finishDrawing}
        style={signatureCanvasStyle}
      />
      <div style={signatureFooterStyle}>
        <small style={helpStyle}>
          {previewUrl
            ? "Firma guardada. Así quedará en el contrato (puedes seguir firmando para completarla):"
            : hasSignature ? "Guardando firma..." : "Todavía no has firmado."}
        </small>
        <button type="button" onClick={clearSignature} style={clearSignatureButtonStyle}>
          Borrar firma
        </button>
      </div>
      {previewUrl && (
        <img
          src={previewUrl}
          alt="Vista previa de la firma guardada"
          style={{ display: "block", maxWidth: "100%", maxHeight: "90px", marginTop: "8px", padding: "6px", border: "1px dashed #2E7D32", borderRadius: "8px", background: "#FFFFFF" }}
        />
      )}
    </div>
  );
}


/* =========================================
   TÍTULO DE SECCIÓN
========================================= */

function SectionTitle({
  numero,
  titulo,
}) {
  return (
    <div style={sectionTitleStyle}>

      <span style={numberStyle}>
        {numero}
      </span>

      <span>
        {titulo}
      </span>

    </div>
  );
}


/* =========================================
   ESTILOS
========================================= */

const pageStyle = {
  minHeight: "100vh",
  width: "100%",
  background: "#F5F8FA",
  padding: "30px 20px",
  boxSizing: "border-box",
};

const containerStyle = {
  maxWidth: "1050px",
  margin: "0 auto",
  background: "#FFFFFF",
  borderRadius: "16px",
  overflow: "hidden",
  boxShadow:
    "0 8px 30px rgba(0, 0, 0, 0.10)",
  border: "1px solid #E5E9EC",
};

const headerStyle = {
  background: "linear-gradient(135deg, #1E88E5 0%, #2E7D32 100%)",
  padding: "30px 35px",
  color: "#FFFFFF",
  boxShadow: "inset 0 -1px 0 rgba(255,255,255,0.15)",
};

const headerTitle = {
  margin: 0,
  fontSize: "30px",
  fontWeight: "800",
  letterSpacing: "0.4px",
};

const headerSubtitle = {
  margin: "7px 0 0",
  fontSize: "14px",
  opacity: 0.98,
  fontWeight: "600",
};

const formStyle = {
  padding: "32px 35px",
};

const gridStyle = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(280px, 1fr))",
  gap: "5px 22px",
};

const sectionTitleStyle = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  marginTop: "28px",
  marginBottom: "20px",
  paddingBottom: "10px",
  borderBottom: "1px solid #E5E9EC",
  color: "#263238",
  fontSize: "18px",
  fontWeight: "700",
};

const numberStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: "32px",
  height: "32px",
  padding: "0 7px",
  borderRadius: "50%",
  background: "#3187B5",
  color: "#FFFFFF",
  fontSize: "13px",
  fontWeight: "700",
};

const labelStyle = {
  display: "block",
  marginBottom: "8px",
  fontWeight: "600",
  fontSize: "14px",
  color: "#263238",
};

const requiredStyle = {
  color: "#D32F2F",
};

const inputStyle = {
  width: "100%",
  height: "46px",
  padding: "0 13px",
  boxSizing: "border-box",
  border: "1px solid #D5DDE2",
  borderRadius: "9px",
  fontSize: "14px",
  color: "#263238",
  outline: "none",
  background: "#FFFFFF",
};

const textareaStyle = {
  width: "100%",
  minHeight: "120px",
  padding: "13px",
  boxSizing: "border-box",
  border: "1px solid #D5DDE2",
  borderRadius: "9px",
  fontSize: "14px",
  color: "#263238",
  outline: "none",
  resize: "vertical",
  fontFamily: "inherit",
};

const fileInputStyle = {
  width: "100%",
  minHeight: "46px",
  padding: "10px",
  boxSizing: "border-box",
  border: "1px dashed #B8C4CC",
  borderRadius: "9px",
  background: "#F8FAFB",
  fontSize: "13px",
};

const helpStyle = {
  display: "block",
  marginTop: "6px",
  color: "#607D8B",
  fontSize: "12px",
};

const mediaButtonStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "44px",
  padding: "10px 16px",
  borderRadius: "8px",
  background: "#1E88E5",
  color: "#FFFFFF",
  fontWeight: "600",
  cursor: "pointer",
  border: "none",
};

const cameraOverlayStyle = {
  position: "fixed",
  inset: 0,
  zIndex: 1000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "16px",
  background: "rgba(0, 0, 0, 0.78)",
};

const cameraDialogStyle = {
  width: "min(100%, 640px)",
  maxHeight: "100%",
  overflowY: "auto",
  padding: "20px",
  borderRadius: "14px",
  background: "#FFFFFF",
  boxSizing: "border-box",
};

const cameraTitleStyle = {
  margin: "0 0 14px",
  color: "#17324D",
  fontSize: "20px",
};

const cameraPreviewStyle = {
  display: "block",
  width: "100%",
  maxHeight: "65vh",
  borderRadius: "10px",
  background: "#101820",
  objectFit: "contain",
};

const cameraErrorStyle = {
  display: "block",
  margin: "10px 0 0",
  color: "#B42318",
  fontSize: "13px",
};

const cameraActionsStyle = {
  display: "flex",
  justifyContent: "flex-end",
  flexWrap: "wrap",
  gap: "10px",
  marginTop: "16px",
};

const cameraCancelButtonStyle = {
  ...mediaButtonStyle,
  background: "#607D8B",
};

const cameraCaptureButtonStyle = {
  ...mediaButtonStyle,
};

const selectedFileStyle = {
  display: "block",
  marginTop: "8px",
  color: "#2E7D32",
};

const signatureFieldStyle = {
  marginBottom: "20px",
};

const signatureCanvasStyle = {
  display: "block",
  width: "100%",
  height: "180px",
  border: "1px solid #90A4AE",
  borderRadius: "8px",
  background: "#FFFFFF",
  touchAction: "none",
  cursor: "crosshair",
};

const signatureFooterStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
  flexWrap: "wrap",
};

const clearSignatureButtonStyle = {
  marginTop: "8px",
  padding: "8px 14px",
  border: "1px solid #90A4AE",
  borderRadius: "6px",
  background: "#FFFFFF",
  color: "#37474F",
  cursor: "pointer",
};

const buttonContainerStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "12px",
  justifyContent: "flex-end",
  marginTop: "35px",
};

const buttonStyle = {
  minWidth: "220px",
  height: "50px",
  border: "none",
  borderRadius: "9px",
  color: "#FFFFFF",
  fontSize: "15px",
  fontWeight: "700",
  boxShadow:
    "0 4px 10px rgba(49, 135, 181, 0.25)",
};

const footerStyle = {
  height: "5px",
  background:
    "linear-gradient(90deg, #8BC34A, #3187B5)",
};

const autorizacionStyle = {
  marginTop: "28px",
  padding: "18px",
  background: "#F8FAFB",
  border: "1px solid #D5DDE2",
  borderRadius: "9px",
};

const autorizacionLabelStyle = {
  display: "flex",
  alignItems: "flex-start",
  gap: "12px",
  color: "#263238",
  fontSize: "14px",
  lineHeight: "1.6",
  cursor: "pointer",
};

const autorizacionCheckboxStyle = {
  width: "20px",
  height: "20px",
  marginTop: "3px",
  flex: "0 0 auto",
  cursor: "pointer",
};

export default Formulario;