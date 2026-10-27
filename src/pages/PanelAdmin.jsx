
import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../supabase";
import logoRD from "../assets/Logo RD Soluciones.jpg.jpeg";
import { crearDocumentoEmpleado, documentosCRD } from "../documentosEmpleado";
import { ITEMS_TARIFA, buscarTarifa, cargosDeItem, deducirItem } from "../tarifasCargos";
import { DOCUMENTOS_EMPLEADO, obtenerDocumentosPorCorregir } from "../../shared/documentReview.js";
import "./PanelAdmin.css";

const ELEMENTOS_POR_PAGINA = 25;
const NOMBRE_DOCUMENTO_CONTRATO = "MODELO CONTRATO PERSONAL MAMONAL.docx";
const PROYECTOS = [
  "ACB3 - SPEC - MAMONAL",
  "BDC - BIDIRECCIONALIDAD CARACOLI",
  "GLB - GASODUCTO LA BELLEZA",
  "ADMON GENERAL",
];

const camposDeTarifa = (tarifa) => ({
  salario_basico: tarifa.salario_basico,
  auxilio_1: tarifa.auxilio_1,
  auxilio_2: tarifa.auxilio_2,
  bono_productividad: tarifa.bono_productividad,
});

const adminFormDeEmpleado = (empleado) => {
  const item = empleado.item || deducirItem(empleado.cargo, empleado.salario_basico);
  const tarifa = buscarTarifa(item, empleado.cargo);

  return {
    item,
    cargo: empleado.cargo || "",
    proyecto: empleado.proyecto || "",
    salario_basico: tarifa?.salario_basico ?? empleado.salario_basico ?? "",
    auxilio_1: empleado.auxilio_1 ?? "",
    auxilio_2: empleado.auxilio_2 ?? "",
    bono_productividad: empleado.bono_productividad ?? "",
    bono_mera_liberalidad: empleado.bono_mera_liberalidad ?? "",
    fecha_inicio_contrato: empleado.fecha_inicio_contrato || "",
    objeto_contrato: empleado.objeto_contrato || "",
    lugar_desempeno_labores: empleado.lugar_desempeno_labores || "",
    lugar_contratacion: empleado.lugar_contratacion || "",
    frente_obra: empleado.frente_obra || "",
  };
};

function SelectItemCargo({ adminForm, cambiarItem, cambiarCargo, estiloLabel, estiloInput }) {
  const cargos = adminForm.item
    ? cargosDeItem(adminForm.item).map(({ cargo }) => cargo)
    : [...new Set(ITEMS_TARIFA.flatMap((item) => cargosDeItem(item).map(({ cargo }) => cargo)))];
  return (
    <>
      <div>
        <label style={estiloLabel}>Ítem</label>
        <select value={adminForm.item || ""} onChange={(event) => cambiarItem(event.target.value)} style={estiloInput}>
          <option value="">Seleccione un ítem</option>
          {ITEMS_TARIFA.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>
      <div>
        <label style={estiloLabel}>Cargo</label>
        <input
          type="text"
          list="admin-cargos-disponibles"
          value={adminForm.cargo || ""}
          onChange={(event) => cambiarCargo(event.target.value)}
          placeholder="Seleccione o escriba un cargo"
          style={estiloInput}
        />
        <datalist id="admin-cargos-disponibles">
          {cargos.map((cargo) => <option key={cargo} value={cargo} />)}
        </datalist>
      </div>
    </>
  );
}

function formatearNombrePropio(nombre) {
  return String(nombre || "")
    .toLocaleLowerCase("es-CO")
    .replace(/(^|[\s'-])(\p{L})/gu, (_, separador, inicial) => (
      `${separador}${inicial.toLocaleUpperCase("es-CO")}`
    ));
}

function Paginacion({ cantidad, pagina, cambiarPagina }) {
  if (!cantidad) return null;

  const totalPaginas = Math.ceil(cantidad / ELEMENTOS_POR_PAGINA);
  const desde = (pagina - 1) * ELEMENTOS_POR_PAGINA + 1;
  const hasta = Math.min(pagina * ELEMENTOS_POR_PAGINA, cantidad);

  return (
    <nav
      className="admin-pagination"
      aria-label="Paginación"
    >
      <span style={{ color: "#607D8B", fontSize: "14px" }}>
        Mostrando {desde}-{hasta} de {cantidad}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <button
          type="button"
          onClick={() => cambiarPagina(pagina - 1)}
          disabled={pagina <= 1}
          className="admin-pagination-button"
        >
          Anterior
        </button>
        <span style={{ color: "#455A64", fontSize: "14px" }}>
          Página {pagina} de {totalPaginas}
        </span>
        <button
          type="button"
          onClick={() => cambiarPagina(pagina + 1)}
          disabled={pagina >= totalPaginas}
          className="admin-pagination-button"
        >
          Siguiente
        </button>
      </div>
    </nav>
  );
}

function EncabezadoAdmin({ descripcion, children }) {
  return (
    <header
      className="admin-page-heading"
      style={{
        background: "#FFFFFF",
        borderRadius: "15px",
        padding: "25px",
        marginBottom: "25px",
        boxShadow: "0 5px 20px rgba(0,0,0,0.08)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "20px",
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
        <img
          src={logoRD}
          alt="Logo RD Soluciones"
          style={{
            width: "54px",
            height: "54px",
            objectFit: "contain",
            borderRadius: "14px",
            background: "#F1F8F2",
            padding: "4px",
          }}
        />
        <div>
          <h1 style={{ margin: 0, color: "#3187B5", fontSize: "24px" }}>
            RD Soluciones
          </h1>
          <p style={{ margin: "5px 0 0", color: "#607D8B" }}>
            {descripcion}
          </p>
        </div>
      </div>
      {children}
    </header>
  );
}

function FiltroPorPersona({ busqueda, cambiarBusqueda, cantidad, etiqueta }) {
  return (
    <div className="admin-toolbar-card admin-person-filter">
      <label>
        <span>Buscar por nombre o cédula</span>
        <input
          type="search"
          value={busqueda}
          onChange={(event) => cambiarBusqueda(event.target.value)}
          placeholder="Escribe un nombre o una cédula"
        />
      </label>
      <span className="admin-result-count">{cantidad} {etiqueta}</span>
    </div>
  );
}

function PanelAdmin({ cerrarSesion }) {
  const [empleados, setEmpleados] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [proyectoFiltro, setProyectoFiltro] = useState("");
  const [estadoPagina, setEstadoPagina] = useState({
    opcion: "empleados",
    busqueda: "",
    proyecto: "",
    pagina: 1,
  });
  const [sincronizandoEmpleados, setSincronizandoEmpleados] = useState(false);
  const [progresoSincronizacion, setProgresoSincronizacion] = useState("");

  const [opcion, setOpcion] = useState("empleados");

  // Estado para edición administrativa por empleado
  const [editingEmpleadoId, setEditingEmpleadoId] = useState(null);
  const [adminForm, setAdminForm] = useState({});

  const cambiarItemAdmin = (item) => {
    setAdminForm((previo) => {
      const tarifa = buscarTarifa(item, previo.cargo);
      return tarifa ? { ...previo, item, ...camposDeTarifa(tarifa) } : { ...previo, item, cargo: "" };
    });
  };

  const cambiarCargoAdmin = (cargo) => {
    setAdminForm((previo) => {
      const item = previo.item || deducirItem(cargo);
      const tarifa = buscarTarifa(item, cargo);
      return tarifa
        ? { ...previo, item, cargo, ...camposDeTarifa(tarifa) }
        : { ...previo, item: "", cargo };
    });
  };

  // =========================
  // USUARIOS AUTORIZADOS
  // =========================
  const [usuarios, setUsuarios] = useState([]);
  const [cargandoUsuarios, setCargandoUsuarios] = useState(false);
  const [cedulaUsuario, setCedulaUsuario] = useState("");
  const [nombreUsuario, setNombreUsuario] = useState("");
  const [guardandoUsuario, setGuardandoUsuario] = useState(false);
  const [empleadoContratoId, setEmpleadoContratoId] = useState("");
  const [tipoDocumentoContrato, setTipoDocumentoContrato] = useState("contrato");
  const [archivoContratoManual, setArchivoContratoManual] = useState(null);
  const [subiendoContratoManual, setSubiendoContratoManual] = useState(false);
  const [descargandoDocumento, setDescargandoDocumento] = useState("");
  const [mensajeContratoManual, setMensajeContratoManual] = useState("");
  const [subiendoContratoId, setSubiendoContratoId] = useState(null);
  const [eliminandoContratoId, setEliminandoContratoId] = useState(null);
  const [contratoPrevisualizar, setContratoPrevisualizar] = useState(null);
  const [publicandoContrato, setPublicandoContrato] = useState(false);
  const [crdVista, setCrdVista] = useState(null);
  const [errorCrdVista, setErrorCrdVista] = useState("");
  const crdVistaRef = useRef(null);
  const crdVistaStylesRef = useRef(null);

  useEffect(() => {
    if (!crdVista?.archivo || !crdVistaRef.current || !crdVistaStylesRef.current) return undefined;

    crdVistaRef.current.replaceChildren();
    crdVistaStylesRef.current.replaceChildren();
    let cancelada = false;

    const renderizar = async () => {
      try {
        const { renderAsync } = await import("docx-preview");
        if (cancelada || !crdVistaRef.current || !crdVistaStylesRef.current) return;
        await renderAsync(crdVista.archivo, crdVistaRef.current, crdVistaStylesRef.current);
      } catch (error) {
        if (cancelada) return;
        console.error("Error mostrando la vista previa del documento:", error);
        setErrorCrdVista("No se pudo mostrar la vista previa. Puedes descargar el documento para revisarlo.");
      }
    };

    void renderizar();
    return () => {
      cancelada = true;
    };
  }, [crdVista]);

  const verDocumentoCRD = async (empleado, nombreDocumento) => {
    const clave = `${empleado.id}-${nombreDocumento}`;
    setDescargandoDocumento(clave);
    setErrorCrdVista("");
    try {
      const archivo = await crearDocumentoEmpleado(empleado, nombreDocumento);
      setCrdVista({ archivo, empleado, nombreDocumento });
    } catch (error) {
      console.error("Error generando la vista previa del documento CRD:", error);
      alert(`No se pudo generar "${nombreDocumento}".\n\n${error?.message || "Error inesperado."}`);
    } finally {
      setDescargandoDocumento("");
    }
  };

  const [errorVistaPrevia, setErrorVistaPrevia] = useState("");
  const [cargandoVistaPrevia, setCargandoVistaPrevia] = useState(false);

  const [pdfVistaPreviaUrl, setPdfVistaPreviaUrl] = useState("");

  useEffect(() => {
    if (!contratoPrevisualizar?.archivo) return undefined;

    let cancelada = false;
    let urlObjeto = "";

    const generarPdfVistaPrevia = async () => {
      try {
        const { data: sesion, error: errorSesion } = await supabase.auth.getSession();
        const token = sesion?.session?.access_token;
        if (errorSesion || !token) {
          throw new Error("La sesión del administrador expiró. Inicia sesión de nuevo.");
        }
        const datos = new FormData();
        datos.append("archivo", contratoPrevisualizar.archivo, "vista-previa.docx");
        datos.append("carpeta", "contratos");
        datos.append("soloVistaPrevia", "true");

        const respuesta = await fetch(`${import.meta.env.VITE_API_URL || ""}/api/archivos`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: datos,
        });
        const resultado = await respuesta.json().catch(() => ({}));
        if (!respuesta.ok || !resultado.pdfBase64) {
          throw new Error(resultado.error || "No se pudo generar el PDF de la vista previa.");
        }
        if (cancelada) return;
        const bytes = Uint8Array.from(atob(resultado.pdfBase64), (caracter) => caracter.charCodeAt(0));
        urlObjeto = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
        setPdfVistaPreviaUrl(urlObjeto);
      } catch (error) {
        if (cancelada) return;
        console.error("Error mostrando la vista previa del contrato:", error);
        setErrorVistaPrevia(
          `No se pudo mostrar la vista previa: ${error?.message || "error al generar el PDF"}. Puedes descargar el Word para revisarlo.`
        );
      } finally {
        if (!cancelada) setCargandoVistaPrevia(false);
      }
    };

    void generarPdfVistaPrevia();

    return () => {
      cancelada = true;
      if (urlObjeto) URL.revokeObjectURL(urlObjeto);
      setPdfVistaPreviaUrl("");
    };
  }, [contratoPrevisualizar]);

  const cerrarVistaPreviaContrato = () => {
    setContratoPrevisualizar(null);
  };

  // =========================
  // CARGAR EMPLEADOS
  // =========================
  const cargarEmpleados = async () => {
    setCargando(true);

    const { data, error } = await supabase
      .from("empleados")
      .select("*")
      .order("cedula", { ascending: true });

    if (error) {
      console.error("Error al cargar empleados:", error);
      alert("No se pudieron cargar los empleados.");
      setEmpleados([]);
    } else {
      const empleadosConFirmas = await Promise.all(
        (data || []).map(async (empleado) => {
          if (empleado.contrato_firmado_url || !empleado.cedula) {
            return empleado;
          }

          const { data: archivosFirmados, error: errorFirmas } = await supabase.storage
            .from("documentos-empleados")
            .list(`contratos-firmados/${empleado.cedula}`, {
              limit: 1,
              sortBy: { column: "created_at", order: "desc" },
            });

          if (errorFirmas || !archivosFirmados?.length) {
            return empleado;
          }

          const archivoFirmado = archivosFirmados[0];
          const rutaFirmada = `contratos-firmados/${empleado.cedula}/${archivoFirmado.name}`;
          const { data: urlData } = supabase.storage
            .from("documentos-empleados")
            .getPublicUrl(rutaFirmada);

          return {
            ...empleado,
            contrato_firmado_url: urlData.publicUrl,
            contrato_estado: "firmado",
          };
        })
      );

      setEmpleados(empleadosConFirmas);
    }

    setCargando(false);
  };

  useEffect(() => {
    const cargarDatosIniciales = async () => {
      await cargarEmpleados();
    };

    void cargarDatosIniciales();
  }, []);

  // =========================
  // BUSCAR EMPLEADOS
  // =========================
  const normalizarBusqueda = (valor) => String(valor || "")
    .toLocaleLowerCase("es-CO")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
  const empleadosFiltrados = empleados.filter((empleado) => {
    const texto = normalizarBusqueda(busqueda);
    const proyectoCoincide = opcion !== "empleados"
      || !proyectoFiltro
      || normalizarBusqueda(empleado.proyecto) === normalizarBusqueda(proyectoFiltro);

    if (!proyectoCoincide) {
      return false;
    }

    return texto === "" || (
      normalizarBusqueda(empleado.cedula).includes(texto) ||
      normalizarBusqueda(empleado.nombre_completo).includes(texto) ||
      normalizarBusqueda(empleado.cargo).includes(texto) ||
      normalizarBusqueda(empleado.proyecto).includes(texto)
    );
  });
  const proyectosEmpleados = [...new Map(
    [
    ...PROYECTOS,
    ...empleados
      .map((empleado) => String(empleado.proyecto || "").trim())
      .filter(Boolean),
    ].map((proyecto) => [
    normalizarBusqueda(proyecto),
    String(proyecto).trim(),
    ])
  ).values()].sort((a, b) => a.localeCompare(b, "es-CO"));
  const usuariosFiltrados = usuarios.filter((usuario) => {
    const texto = normalizarBusqueda(busqueda);
    return !texto
      || normalizarBusqueda(usuario.cedula).includes(texto)
      || normalizarBusqueda(usuario.nombre_completo).includes(texto);
  });
  const cantidadElementosActuales = opcion === "usuarios"
    ? usuariosFiltrados.length
    : empleadosFiltrados.length;
  const paginasActuales = Math.max(
    1,
    Math.ceil(cantidadElementosActuales / ELEMENTOS_POR_PAGINA)
  );
  const paginaSolicitada = estadoPagina.opcion === opcion
    && estadoPagina.busqueda === busqueda
    && estadoPagina.proyecto === (opcion === "empleados" ? proyectoFiltro : "")
    ? estadoPagina.pagina
    : 1;
  const paginaActual = Math.min(paginaSolicitada, paginasActuales);
  const cambiarPagina = (pagina) => {
    setEstadoPagina({
      opcion,
      busqueda,
      proyecto: opcion === "empleados" ? proyectoFiltro : "",
      pagina,
    });
  };
  const empleadosPaginados = empleadosFiltrados.slice(
    (paginaActual - 1) * ELEMENTOS_POR_PAGINA,
    paginaActual * ELEMENTOS_POR_PAGINA
  );
  const usuariosPaginados = usuariosFiltrados.slice(
    (paginaActual - 1) * ELEMENTOS_POR_PAGINA,
    paginaActual * ELEMENTOS_POR_PAGINA
  );

  // =========================
  // COLUMNAS EXCEL / TABLA
  // =========================
  const columnasEmpleado = [
    { key: "cedula", label: "CEDULA" },
    { key: "nombre_completo", label: "NOMBRE COMPLETO" },
    { key: "cargo", label: "CARGO" },
    { key: "proyecto", label: "PROYECTO" },
    { key: "lugar_expedicion", label: "LUGAR EXPEDICION" },
    { key: "fecha_nacimiento", label: "FECHA NACIMIENTO" },
    { key: "lugar_nacimiento", label: "LUGAR NACIMIENTO" },
    { key: "celular", label: "CELULAR" },
    { key: "direccion", label: "DIRECCION" },
    { key: "ciudad", label: "CIUDAD" },
    { key: "salario_basico", label: "SALARIO DIA" },
    { key: "auxilio_1", label: "AUXILIO 1" },
    { key: "auxilio_2", label: "AUXILIO 2" },
    { key: "bono_productividad", label: "BONO PRODUCTIVIDAD" },
    { key: "bono_mera_liberalidad", label: "BONO MERA LIBERALIDAD" },
    { key: "cuenta_bancaria", label: "CUENTA BANCARIA" },
    { key: "entidad_financiera", label: "ENTIDAD FINANCIERA" },
    { key: "persona_contacto", label: "PERSONA CONTACTO" },
    { key: "celular_contacto", label: "CELULAR CONTACTO" },
    { key: "parentesco", label: "PARENTESCO" },
    { key: "estado_civil", label: "ESTADO CIVIL" },
    { key: "tipo_sangre", label: "TIPO SANGRE" },
    { key: "eps", label: "EPS" },
    { key: "eps_otra", label: "EPS OTRA" },
    { key: "fondo_pension", label: "FONDO PENSION" },
    { key: "fondo_pension_otra", label: "FONDO PENSION OTRA" },
    { key: "talla_botas", label: "TALLA BOTAS" },
    { key: "talla_camisa", label: "TALLA CAMISA" },
    { key: "talla_pantalon", label: "TALLA PANTALON" },
    { key: "fecha_inicio_contrato", label: "FECHA INICIO CONTRATO" },
    { key: "objeto_contrato", label: "OBJETO CONTRATO" },
    { key: "lugar_desempeno_labores", label: "LUGAR DONDE DESEMPEÑARÁ LAS LABORES" },
    { key: "lugar_contratacion", label: "LUGAR DE CONTRATACIÓN" },
    { key: "frente_obra", label: "FRENTE DE OBRA" },
  ];

  // =========================
  // OBTENER VALOR DE CAMPO
  // =========================
  const valorCampoEmpleado = (empleado, key) => {
    if (!empleado) return "";

    if (key === "lugar_expedicion") {
      const departamento =
        empleado.lugar_expedicion_departamento || "";

      const municipio =
        empleado.lugar_expedicion_municipio || "";

      return [departamento, municipio]
        .filter(Boolean)
        .join(" / ");
    }

    if (key === "lugar_nacimiento") {
      const departamento =
        empleado.lugar_nacimiento_departamento || "";

      const municipio =
        empleado.lugar_nacimiento_municipio || "";

      return [departamento, municipio]
        .filter(Boolean)
        .join(" / ");
    }

    if (key === "ciudad") {
      const departamento =
        empleado.ciudad_departamento || "";

      const municipio =
        empleado.ciudad_municipio || "";

      return [departamento, municipio]
        .filter(Boolean)
        .join(" / ");
    }

    return empleado[key] ?? "";
  };

  // =========================
  // DESCARGAR EXCEL
  // =========================
  const descargarExcel = () => {
    if (empleados.length === 0) {
      alert("No hay empleados registrados para descargar.");
      return;
    }

    const encabezadosExcel = columnasEmpleado.map(({ label }) => label);
    const datosExcel = empleados.map((empleado) => (
      columnasEmpleado.map(({ key }) => valorCampoEmpleado(empleado, key) || "")
    ));

    const hoja = XLSX.utils.aoa_to_sheet([encabezadosExcel, ...datosExcel]);

    hoja["!cols"] = columnasEmpleado.map(({ label }) => ({
      wch: Math.max(
        16,
        Math.min(40, label.length + 6)
      ),
    }));

    const libro = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      libro,
      hoja,
      "Empleados"
    );

    XLSX.writeFile(
      libro,
      "empleados_registrados.xlsx"
    );
  };

  const sincronizarEmpleados = async () => {
    setSincronizandoEmpleados(true);
    let empleadosSincronizados = 0;
    let totalEmpleados = 0;
    let archivosCopiados = 0;
    let archivosMovidos = 0;
    let archivosRenombrados = 0;
    let duplicadosEnPapelera = 0;
    let carpetasCreadas = 0;
    const documentosSinResolver = [];

    try {
      const todosLosEmpleados = [];
      const tamanoPagina = 500;
      for (let desde = 0; ; desde += tamanoPagina) {
        const { data, error } = await supabase
          .from("empleados")
          .select("*")
          .order("cedula", { ascending: true })
          .range(desde, desde + tamanoPagina - 1);
        if (error) throw error;
        todosLosEmpleados.push(...(data || []));
        if ((data || []).length < tamanoPagina) break;
      }

      totalEmpleados = todosLosEmpleados.length;
      if (!totalEmpleados) {
        alert("No hay empleados registrados para sincronizar.");
        return;
      }
      if (!window.confirm(
        `Se sincronizarán los ${totalEmpleados} empleados con Drive y Excel. Los documentos de Drive se moverán y renombrarán en la carpeta de cada empleado; las copias antiguas creadas por la sincronización se enviarán a la papelera. ¿Continuar?`
      )) return;

      const { data: sesion, error: errorSesion } = await supabase.auth.getSession();
      if (errorSesion || !sesion.session?.access_token) {
        throw new Error("La sesión del administrador expiró. Inicia sesión de nuevo.");
      }

      const lotes = [];
      for (let indice = 0; indice < todosLosEmpleados.length; indice += 10) {
        lotes.push(todosLosEmpleados.slice(indice, indice + 10));
      }

      for (const [indiceLote, lote] of lotes.entries()) {
        setProgresoSincronizacion(
          `Sincronizando empleados de la base de datos: ${empleadosSincronizados} de ${totalEmpleados}...`
        );
        const respuesta = await fetch(
          `${import.meta.env.VITE_API_URL || ""}/api/sincronizar-empleados`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${sesion.session.access_token}`,
            },
            body: JSON.stringify({ empleados: lote }),
          }
        );
        const resultado = await respuesta.json().catch(() => ({}));
        if (!respuesta.ok) {
          throw new Error(resultado.error || `No se pudo sincronizar el lote ${indiceLote + 1}.`);
        }

        for (const empleadoResultado of resultado.results || []) {
          const cambios = empleadoResultado.documentUrls || {};
          if (Object.keys(cambios).length) {
            const { error } = await supabase
              .from("empleados")
              .update(cambios)
              .eq("id", empleadoResultado.id);
            if (error) {
              throw new Error(
                `Se procesaron documentos de ${empleadoResultado.cedula}, pero no se pudieron guardar sus direcciones en la base de datos: ${error.message}`
              );
            }
            setEmpleados((anteriores) => anteriores.map((empleado) => (
              empleado.id === empleadoResultado.id
                ? { ...empleado, ...cambios }
                : empleado
            )));
          }
          for (const documento of empleadoResultado.unresolvedDocuments || []) {
            documentosSinResolver.push(
              `${empleadoResultado.cedula} · ${documento.field}: ${documento.reason}`
            );
          }
        }

        empleadosSincronizados += lote.length;
        archivosCopiados += resultado.filesCopied || 0;
        archivosMovidos += resultado.filesMoved || 0;
        archivosRenombrados += resultado.filesRenamed || 0;
        duplicadosEnPapelera += resultado.filesDeduplicated || 0;
        carpetasCreadas += resultado.foldersCreated || 0;
      }

      const detalleDocumentos = documentosSinResolver.length
        ? `\n\nDocumentos que no se pudieron procesar (${documentosSinResolver.length}):\n${documentosSinResolver.slice(0, 12).join("\n")}${documentosSinResolver.length > 12 ? `\n... y ${documentosSinResolver.length - 12} más.` : ""}`
        : "";
      alert(
        `Sincronización completa: ${empleadosSincronizados} empleados, ${carpetasCreadas} carpetas creadas, ${archivosMovidos} archivos movidos a las carpetas de empleados, ${archivosRenombrados} renombrados, ${duplicadosEnPapelera} copias anteriores enviadas a la papelera y ${archivosCopiados} documentos copiados desde Storage. Las filas quedaron actualizadas en Excel.${detalleDocumentos}`
      );
    } catch (error) {
      console.error("Error sincronizando empleados con Drive y Excel:", error);
      alert(
        `La sincronización se detuvo después de procesar ${empleadosSincronizados} de ${totalEmpleados || empleados.length} empleados.\n\n${error?.message || "Error al sincronizar."}\nPuedes volver a intentarlo; las filas del Excel se actualizan por cédula.`
      );
    } finally {
      setSincronizandoEmpleados(false);
      setProgresoSincronizacion("");
    }
  };

  // =========================
  // CARGAR USUARIOS
  // =========================
  const cargarUsuarios = async () => {
    setCargandoUsuarios(true);

    const { data, error } = await supabase
      .from("usuarios_autorizados")
      .select("*")
      .order("cedula", {
        ascending: true,
      });

    if (error) {
      console.error(
        "Error al cargar usuarios:",
        error
      );

      alert(
        "No se pudieron cargar los usuarios autorizados."
      );

      setUsuarios([]);
    } else {
      setUsuarios(data || []);
    }

    setCargandoUsuarios(false);
  };

  const subirContratoManual = async (event) => {
    event.preventDefault();
    const empleado = empleados.find((item) => String(item.id) === empleadoContratoId);

    if (!empleado || !archivoContratoManual) {
      setMensajeContratoManual("Selecciona una persona y un PDF o documento Word del contrato.");
      return;
    }

    const extension = archivoContratoManual.name.split(".").pop()?.toLowerCase();
    const esPdf = extension === "pdf" && archivoContratoManual.type === "application/pdf";
    const esWord = ["doc", "docx"].includes(extension)
      && (
        !archivoContratoManual.type
        || archivoContratoManual.type === "application/msword"
        || archivoContratoManual.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );
    if (!esPdf && !esWord) {
      setMensajeContratoManual("El archivo debe ser un PDF o un documento Word .doc/.docx válido.");
      return;
    }
    if (archivoContratoManual.size > 10 * 1024 * 1024) {
      setMensajeContratoManual("El archivo no puede superar los 10 MB.");
      return;
    }
    if ((empleado.contrato_url || empleado.contrato_firmado_url) && !window.confirm("Esta persona ya tiene un contrato. ¿Deseas reemplazar el PDF publicado?")) {
      return;
    }

    setSubiendoContratoManual(true);
    setMensajeContratoManual("");
    try {
      const { data: sesion, error: errorSesion } = await supabase.auth.getSession();
      if (errorSesion || !sesion.session?.access_token) {
        throw new Error("La sesión del administrador expiró. Inicia sesión de nuevo.");
      }

      const datosArchivo = new FormData();
      datosArchivo.append("archivo", archivoContratoManual, archivoContratoManual.name);
      datosArchivo.append("carpeta", "contratos");
      datosArchivo.append("documento", tipoDocumentoContrato);
      datosArchivo.append("cedula", empleado.cedula);
      datosArchivo.append("nombreCompleto", empleado.nombre_completo);
      if (esWord) datosArchivo.append("convertirAPdf", "true");

      const respuesta = await fetch(`${import.meta.env.VITE_API_URL || ""}/api/archivos`, {
        method: "POST",
        headers: { Authorization: `Bearer ${sesion.session.access_token}` },
        body: datosArchivo,
      });
      const resultado = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok) {
        throw new Error(resultado.error || "No se pudo subir el contrato.");
      }

      const documento = {
        tipo: tipoDocumentoContrato,
        name: resultado.nombre || archivoContratoManual.name.replace(/\.(doc|docx)$/i, ".pdf"),
        url: resultado.url,
        publicado: true,
        publicado_at: new Date().toISOString(),
      };
      const documentosActuales = Array.isArray(empleado.contrato_documentos)
        ? empleado.contrato_documentos.filter((item) => item?.tipo !== tipoDocumentoContrato)
        : [];
      const cambios = {
        contrato_url: tipoDocumentoContrato === "contrato" ? resultado.url : empleado.contrato_url,
        contrato_nombre: tipoDocumentoContrato === "contrato" ? documento.name : empleado.contrato_nombre,
        contrato_documentos: [...documentosActuales, documento],
        contrato_estado: "publicado",
        contrato_enviado_at: new Date().toISOString(),
        contrato_aceptado: false,
        contrato_aceptado_at: null,
        contrato_documentos_firmados: [],
        contrato_firmado_url: null,
        contrato_firmado_at: null,
      };
      const { error } = await supabase
        .from("empleados")
        .update(cambios)
        .eq("id", empleado.id);
      if (error) throw error;

      setEmpleados((anteriores) => anteriores.map((item) => (
        item.id === empleado.id ? { ...item, ...cambios } : item
      )));
      setArchivoContratoManual(null);
      setMensajeContratoManual(`${tipoDocumentoContrato === "contrato" ? "Contrato" : "Anexo CRD"} publicado como PDF para ${empleado.nombre_completo}.`);
    } catch (error) {
      console.error("Error enviando contrato manual:", error);
      setMensajeContratoManual(error?.message || "No se pudo enviar el contrato.");
    } finally {
      setSubiendoContratoManual(false);
    }
  };

  const publicarDocumentosContrato = async (empleado, modo) => {
    if (!empleado) {
      setMensajeContratoManual("Selecciona una persona antes de publicar los documentos.");
      return;
    }
    setPublicandoContrato(true);
    setMensajeContratoManual("");
    try {
      const { data: sesion, error: errorSesion } = await supabase.auth.getSession();
      const token = sesion.session?.access_token;
      if (errorSesion || !token) {
        throw new Error("La sesión del administrador expiró. Inicia sesión de nuevo.");
      }

      const nombresDocumentos = modo === "contrato"
        ? [NOMBRE_DOCUMENTO_CONTRATO]
        : modo === "anexos"
          ? documentosCRD.filter((nombre) => nombre !== NOMBRE_DOCUMENTO_CONTRATO)
          : documentosCRD;
      const documentosPublicados = [];
      for (const nombreDocumento of nombresDocumentos) {
        const esContrato = nombreDocumento === NOMBRE_DOCUMENTO_CONTRATO;
        const archivo = await crearDocumentoEmpleado(empleado, nombreDocumento);
        const datosArchivo = new FormData();
        datosArchivo.append("archivo", archivo, nombreDocumento);
        datosArchivo.append("carpeta", "contratos");
        datosArchivo.append(
          "documento",
          esContrato ? "contrato" : `anexo:${nombreDocumento.replace(/\.(doc|docx|pdf)$/i, "")}`
        );
        datosArchivo.append("cedula", empleado.cedula);
        datosArchivo.append("nombreCompleto", empleado.nombre_completo);
        datosArchivo.append("convertirAPdf", "true");

        const respuesta = await fetch(`${import.meta.env.VITE_API_URL || ""}/api/archivos`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: datosArchivo,
        });
        const resultado = await respuesta.json().catch(() => ({}));
        if (!respuesta.ok) {
          throw new Error(resultado.error || `No se pudo publicar "${nombreDocumento}".`);
        }

        documentosPublicados.push({
          tipo: esContrato ? "contrato" : `anexo:${nombreDocumento}`,
          name: resultado.nombre || nombreDocumento.replace(/\.docx$/i, ".pdf"),
          url: resultado.url,
          publicado: true,
          publicado_at: new Date().toISOString(),
        });
      }

      const contrato = documentosPublicados.find((documento) => documento.tipo === "contrato");
      const documentosPrevios = Array.isArray(empleado.contrato_documentos)
        ? empleado.contrato_documentos
        : [];
      const tiposPublicados = new Set(documentosPublicados.map((documento) => documento.tipo));
      const cambios = {
        contrato_documentos: [
          ...documentosPrevios.filter((documento) => !tiposPublicados.has(documento?.tipo)),
          ...documentosPublicados,
        ],
      };
      if (contrato) {
        Object.assign(cambios, {
          contrato_url: contrato.url,
          contrato_nombre: contrato.name,
          contrato_estado: "publicado",
          contrato_enviado_at: new Date().toISOString(),
          contrato_aceptado: false,
          contrato_aceptado_at: null,
          contrato_documentos_firmados: [],
          contrato_firmado_url: null,
          contrato_firmado_at: null,
        });
      }
      const { error } = await supabase
        .from("empleados")
        .update(cambios)
        .eq("id", empleado.id);
      if (error) {
        if (/contrato_documentos|contrato_aceptado/i.test(error.message || "")) {
          throw new Error("Supabase aún no tiene las columnas de documentos publicados. Ejecuta database/contratos.sql y recarga la aplicación.");
        }
        throw error;
      }

      setEmpleados((anteriores) => anteriores.map((item) => (
        item.id === empleado.id ? { ...item, ...cambios } : item
      )));
      const mensaje = modo === "contrato"
        ? `Se publicó el contrato para ${empleado.nombre_completo}.`
        : modo === "anexos"
          ? `Se publicaron ${documentosPublicados.length} anexos CRD para ${empleado.nombre_completo}.`
          : `Se publicó el contrato y ${documentosPublicados.length - 1} anexos CRD para ${empleado.nombre_completo}.`;
      setMensajeContratoManual(mensaje);
    } catch (error) {
      console.error(`Error publicando ${modo} del contrato:`, error);
      setMensajeContratoManual(error?.message || `No se pudieron publicar ${modo} del contrato.`);
    } finally {
      setPublicandoContrato(false);
    }
  };

  const guardarRevisionDocumento = async (empleado, clave, observacion) => {
    const texto = String(observacion || "").trim();
    if (!texto) throw new Error("Escribe una nota para explicar qué debe corregir el empleado.");
    const revision = {
      ...(empleado.documentos_revision || {}),
      [clave]: {
        estado: "corregir",
        observacion: texto,
        revisado_at: new Date().toISOString(),
      },
    };
    const { data, error } = await supabase
      .from("empleados")
      .update({ documentos_revision: revision })
      .eq("id", empleado.id)
      .select("id")
      .maybeSingle();
    if (error) {
      if (/documentos_revision/i.test(error.message || "")) {
        throw new Error("Falta agregar la columna documentos_revision en Supabase. Ejecuta database/revision-documentos.sql.");
      }
      throw error;
    }
    if (!data) throw new Error("No se pudo guardar la observación del documento.");
    setEmpleados((anteriores) => anteriores.map((item) => (
      String(item.id) === String(empleado.id)
        ? { ...item, documentos_revision: revision }
        : item
    )));
  };

  const guardarDatosAdministrativos = async (empleado) => {
    const { item: itemExcel, ...updates } = adminForm;
    updates.proyecto = String(adminForm.proyecto || "").trim() || null;
    ["salario_basico", "auxilio_1", "auxilio_2", "bono_productividad", "bono_mera_liberalidad"].forEach((campo) => {
      updates[campo] = updates[campo] === "" ? null : Number(updates[campo]);
    });
    [
      "cargo",
      "proyecto",
      "fecha_inicio_contrato",
      "objeto_contrato",
      "lugar_desempeno_labores",
      "lugar_contratacion",
      "frente_obra",
    ].forEach((campo) => {
      updates[campo] = String(updates[campo] || "").trim() || null;
    });
    const { data: empleadoActualizado, error } = await supabase
      .from("empleados")
      .update(updates)
      .eq("id", empleado.id)
      .select("*")
      .single();
    if (error) {
      if (/lugar_desempeno_labores|lugar_contratacion|frente_obra|bono_mera_liberalidad/i.test(error.message || "")) {
        throw new Error("Supabase aún no tiene los nuevos campos del contrato. Ejecuta database/contratos.sql y vuelve a intentarlo.");
      }
      throw error;
    }
    if (!empleadoActualizado) {
      throw new Error("No se recibieron los datos actualizados del empleado.");
    }
    const proyectoEsperado = String(updates.proyecto || "").trim();
    const proyectoGuardado = String(empleadoActualizado.proyecto || "").trim();
    if (proyectoGuardado !== proyectoEsperado) {
      throw new Error(
        `Supabase no devolvió el proyecto seleccionado. Seleccionaste "${proyectoEsperado || "(vacío)"}" y el registro quedó con "${proyectoGuardado || "(vacío)"}".`
      );
    }

    setEmpleados((anteriores) => anteriores.map((item) => (
      String(item.id) === String(empleado.id)
        ? { ...item, ...empleadoActualizado }
        : item
    )));
    setAdminForm((anterior) => ({
      ...anterior,
      ...empleadoActualizado,
      item: anterior.item || "",
    }));
    if (updates.proyecto !== empleado.proyecto) {
      setProyectoFiltro("");
    }
    setEditingEmpleadoId(null);

    try {
      const camposExcel = {
        cedula: empleado.cedula,
        ...(itemExcel ? { item: itemExcel } : {}),
        ...updates,
      };

      const cuerpoExcel = JSON.stringify({
        encabezados: Object.keys(camposExcel),
        valores: Object.values(camposExcel).map((valor) => valor ?? ""),
      });
      const maxIntentos = 4;
      for (let intento = 1; intento <= maxIntentos; intento += 1) {
        try {
          const respuestaExcel = await fetch(
            `${import.meta.env.VITE_API_URL || ""}/api/hoja-empleados`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: cuerpoExcel,
            }
          );
          if (respuestaExcel.ok) break;
          const resultadoExcel = await respuestaExcel.json().catch(() => ({}));
          throw new Error(resultadoExcel.error || `HTTP ${respuestaExcel.status}`);
        } catch (errorIntento) {
          if (intento === maxIntentos) throw errorIntento;
          await new Promise((resolver) => setTimeout(resolver, 1000 * intento));
        }
      }
    } catch (errorExcel) {
      console.error("Cambios guardados, pero no se actualizó el Excel:", errorExcel);
      alert(`Los cambios se guardaron, pero no se pudo actualizar el Excel.\n\n${errorExcel?.message || ""}`);
    }
  };

  const guardarEdicionEmpleado = async (empleado) => {
    setSubiendoContratoId(empleado.id);
    try {
      await guardarDatosAdministrativos(empleado);
    } catch (error) {
      console.error("Error guardando los datos administrativos del empleado:", error);
      alert(`No se pudieron guardar los cambios.\n\n${error?.message || ""}`);
    } finally {
      setSubiendoContratoId(null);
    }
  };

  const previsualizarContrato = async (empleado) => {
    let pasoActual = "cargar datos del empleado";
    setErrorVistaPrevia("");
    setCargandoVistaPrevia(true);
    setContratoPrevisualizar({
      archivo: null,
      nombreArchivo: `contrato_${empleado.cedula}.docx`,
      empleadoId: empleado.id,
      nombreEmpleado: empleado.nombre_completo,
    });
    setSubiendoContratoId(empleado.id);

    try {
      if (String(editingEmpleadoId) === String(empleado.id)) {
        pasoActual = "guardar los cambios administrativos";
        await guardarDatosAdministrativos(empleado);
      }

      const { data: empleadoActual, error: errorEmpleado } = await supabase
        .from("empleados")
        .select("*")
        .eq("id", empleado.id)
        .single();

      if (errorEmpleado || !empleadoActual) {
        throw errorEmpleado || new Error("No se encontró el empleado actualizado.");
      }

      pasoActual = "rellenar la plantilla del contrato";
      const archivo = await crearDocumentoEmpleado(
        empleadoActual,
        NOMBRE_DOCUMENTO_CONTRATO
      );
      const nombreArchivo = `contrato_${empleadoActual.cedula}.docx`;

      setErrorVistaPrevia("");
      setContratoPrevisualizar({
        archivo,
        nombreArchivo,
        empleadoId: empleadoActual.id,
        nombreEmpleado: empleadoActual.nombre_completo,
      });
    } catch (error) {
      const detalleError = error?.message || JSON.stringify(error);
      console.error(`Error generando vista previa al ${pasoActual}:`, error);
      setErrorVistaPrevia(
        `No se pudo generar la vista previa del contrato. Paso: ${pasoActual}. ${detalleError}`
      );
      setCargandoVistaPrevia(false);
    } finally {
      setSubiendoContratoId(null);
    }
  };

  const eliminarContrato = async (empleado) => {
    if (!window.confirm(
      `¿Eliminar el contrato de ${empleado.nombre_completo} y el archivo firmado asociado? Esta acción no se puede deshacer.`
    )) {
      return;
    }

    setEliminandoContratoId(String(empleado.id));
    try {
      const { data: sesion, error: errorSesion } = await supabase.auth.getSession();
      const token = sesion.session?.access_token;
      if (errorSesion || !token) {
        throw new Error("La sesión del administrador expiró. Inicia sesión de nuevo.");
      }

      const { data: empleadoActual, error: errorEmpleado } = await supabase
        .from("empleados")
        .select("contrato_documentos, contrato_documentos_firmados, contrato_url, contrato_firmado_url")
        .eq("id", empleado.id)
        .maybeSingle();
      if (errorEmpleado) throw errorEmpleado;
      if (!empleadoActual) throw new Error("No se encontró el contrato actual del empleado.");

      const archivosParaEliminar = [
        ...(Array.isArray(empleadoActual.contrato_documentos)
          ? empleadoActual.contrato_documentos.map((documento) => [documento?.url, "contratos"])
          : []),
        ...(Array.isArray(empleadoActual.contrato_documentos_firmados)
          ? empleadoActual.contrato_documentos_firmados.map((documento) => [documento?.url, "contratos-firmados"])
          : []),
        [empleadoActual.contrato_url, "contratos"],
        [empleadoActual.contrato_firmado_url, "contratos-firmados"],
      ].filter(([url], indice, archivos) => (
        url && archivos.findIndex(([otroUrl]) => otroUrl === url) === indice
      ));

      for (const [url, carpeta] of archivosParaEliminar) {
        if (!url) continue;

        const rutaStorage = extraerRutaStorage(url, "documentos-empleados");
        if (rutaStorage) {
          const { error } = await supabase.storage
            .from("documentos-empleados")
            .remove([rutaStorage]);
          if (error) throw error;
          continue;
        }

        let archivoId;
        try {
          const urlArchivo = new URL(url);
          archivoId = urlArchivo.searchParams.get("id")
            || urlArchivo.pathname.match(/\/(?:file\/d|d)\/([^/]+)/)?.[1];
        } catch {
          throw new Error("No se pudo identificar el archivo del contrato guardado.");
        }
        if (!archivoId) {
          throw new Error("No se pudo identificar el archivo del contrato guardado.");
        }

        const respuesta = await fetch(
          `${import.meta.env.VITE_API_URL || ""}/api/archivos?accion=eliminar-contrato&fileId=${encodeURIComponent(archivoId)}&cedula=${encodeURIComponent(empleado.cedula)}&carpeta=${encodeURIComponent(carpeta)}`,
          { method: "POST", headers: { Authorization: `Bearer ${token}` } }
        );
        const textoRespuesta = await respuesta.text();
        let resultado = {};
        try {
          resultado = textoRespuesta ? JSON.parse(textoRespuesta) : {};
        } catch {
          resultado = {};
        }
        if (!respuesta.ok) {
          throw new Error(
            resultado.error
            || `El servidor no pudo eliminar el archivo (HTTP ${respuesta.status}). Comprueba que el backend esté actualizado.`
          );
        }
      }

      const { error } = await supabase
        .from("empleados")
        .update({
          contrato_url: null,
          contrato_nombre: null,
          contrato_estado: null,
          contrato_enviado_at: null,
          contrato_documentos: [],
          contrato_documentos_firmados: [],
          contrato_aceptado: false,
          contrato_aceptado_at: null,
          contrato_firmado_url: null,
          contrato_firmado_at: null,
        })
        .eq("id", empleado.id);
      if (error) throw error;

      setEmpleados((anteriores) => anteriores.map((item) => (
        item.id === empleado.id
          ? {
              ...item,
              contrato_url: null,
              contrato_nombre: null,
              contrato_estado: null,
              contrato_enviado_at: null,
              contrato_documentos: [],
              contrato_documentos_firmados: [],
              contrato_aceptado: false,
              contrato_aceptado_at: null,
              contrato_firmado_url: null,
              contrato_firmado_at: null,
            }
          : item
      )));
      alert("Contrato eliminado correctamente.");
    } catch (error) {
      console.error("Error eliminando contrato:", error);
      alert(`No se pudo eliminar el contrato.\n\n${error?.message || "Error inesperado."}`);
    } finally {
      setEliminandoContratoId(null);
    }
  };

  const descargarContratoPrevisualizado = () => {
    if (!contratoPrevisualizar) return;
    const url = URL.createObjectURL(contratoPrevisualizar.archivo);
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = contratoPrevisualizar.nombreArchivo;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const nombreContratoPublicado = () => {
    const empleado = empleados.find(
      (item) => String(item.id) === String(contratoPrevisualizar?.empleadoId)
    );
    const nombreSeguro = (empleado?.nombre_completo || contratoPrevisualizar?.nombreEmpleado || "empleado")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "");
    return `contrato_${empleado?.cedula || "empleado"}_${nombreSeguro}.pdf`;
  };

  const publicarContratoPrevisualizado = async () => {
    const archivo = contratoPrevisualizar?.archivo;
    if (!archivo || !contratoPrevisualizar) {
      alert("Primero espera a que el contrato aparezca en la vista previa.");
      return;
    }
    const empleado = empleados.find(
      (item) => String(item.id) === String(contratoPrevisualizar.empleadoId)
    );
    if (!empleado) {
      alert("No se encontró al empleado asociado con este contrato.");
      return;
    }
    if (
      (empleado.contrato_url || empleado.contrato_firmado_url)
      && !window.confirm(`Ya existe un contrato para ${empleado.nombre_completo}. ¿Deseas reemplazar el documento publicado?`)
    ) return;

    setPublicandoContrato(true);
    try {
      const nombreContrato = nombreContratoPublicado();
      const { data: sesion, error: errorSesion } = await supabase.auth.getSession();
      if (errorSesion || !sesion.session?.access_token) {
        throw new Error("La sesión del administrador expiró. Inicia sesión de nuevo.");
      }
      const datosArchivo = new FormData();
      datosArchivo.append("archivo", archivo, nombreContrato.replace(/\.pdf$/i, ".docx"));
      datosArchivo.append("carpeta", "contratos");
      datosArchivo.append("documento", "contrato");
      datosArchivo.append("cedula", empleado.cedula);
      datosArchivo.append("nombreCompleto", empleado.nombre_completo);
      datosArchivo.append("convertirAPdf", "true");

      const respuesta = await fetch(`${import.meta.env.VITE_API_URL || ""}/api/archivos`, {
        method: "POST",
        headers: { Authorization: `Bearer ${sesion.session.access_token}` },
        body: datosArchivo,
      });
      const resultado = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok) {
        throw new Error(resultado.error || "No se pudo subir el contrato de vista previa a Drive.");
      }

      const cambios = {
        contrato_url: resultado.url,
        contrato_nombre: resultado.nombre || nombreContrato,
        contrato_documentos: [
          ...(Array.isArray(empleado.contrato_documentos)
            ? empleado.contrato_documentos.filter((item) => item?.tipo !== "contrato")
            : []),
          {
            tipo: "contrato",
            name: resultado.nombre || nombreContrato,
            url: resultado.url,
            publicado: true,
            publicado_at: new Date().toISOString(),
          },
        ],
        contrato_estado: "publicado",
        contrato_enviado_at: new Date().toISOString(),
        contrato_aceptado: false,
        contrato_aceptado_at: null,
        contrato_documentos_firmados: [],
        contrato_firmado_url: null,
        contrato_firmado_at: null,
      };
      const { error } = await supabase
        .from("empleados")
        .update(cambios)
        .eq("id", empleado.id);
      if (error) {
        throw new Error(`El documento subió a Drive, pero no se pudo publicar en la cuenta del empleado: ${error.message}`);
      }

      setEmpleados((anteriores) => anteriores.map((item) => (
        item.id === empleado.id ? { ...item, ...cambios } : item
      )));
      alert(`Contrato publicado para ${empleado.nombre_completo}. Ya puede descargarlo desde su cuenta.`);
      cerrarVistaPreviaContrato();
    } catch (error) {
      console.error("Error publicando el contrato de vista previa:", error);
      alert(`No se pudo publicar el contrato.\n\n${error?.message || "Error inesperado."}`);
    } finally {
      setPublicandoContrato(false);
    }
  };

  // =========================
  // CREAR USUARIO
  // =========================
  const crearUsuario = async (e) => {
    e.preventDefault();

    if (
      !cedulaUsuario.trim() ||
      !nombreUsuario.trim()
    ) {
      alert(
        "Debes ingresar la cédula y el nombre completo."
      );
      return;
    }

    setGuardandoUsuario(true);

    const { error } = await supabase
      .from("usuarios_autorizados")
      .insert([
        {
          cedula: cedulaUsuario.trim(),
          nombre_completo:
            nombreUsuario.trim(),
        },
      ]);

    if (error) {
      console.error(
        "Error al crear usuario:",
        error
      );

      if (error.code === "23505") {
        alert(
          "Esta cédula ya está registrada como usuario autorizado."
        );
      } else {
        alert(
          "No se pudo crear el usuario."
        );
      }

      setGuardandoUsuario(false);
      return;
    }

    alert("Usuario creado correctamente.");

    setCedulaUsuario("");
    setNombreUsuario("");

    await cargarUsuarios();

    setGuardandoUsuario(false);
  };

  // =========================
  // ELIMINAR USUARIO AUTORIZADO
  // =========================
  const eliminarUsuario = async (id, cedula) => {
    const confirmar = window.confirm(
      "¿Estás seguro de eliminar este usuario autorizado?"
    );

    if (!confirmar) return;

    const { data, error } = await supabase
      .from("usuarios_autorizados")
      .delete()
      .eq("id", id)
      .select("id");

    if (error || !data?.length) {
      console.error(
        "Error al eliminar usuario:",
        error || "No se eliminó por id"
      );

      const resultadoCedula = await supabase
        .from("usuarios_autorizados")
        .delete()
        .eq("cedula", cedula)
        .select("id");

      if (resultadoCedula.error || !resultadoCedula.data?.length) {
        alert(`No se pudo eliminar el usuario. ${resultadoCedula.error?.message || "Verifica las políticas RLS de DELETE."}`);
        return;
      }
    }

    alert(
      "Usuario eliminado correctamente."
    );

    await cargarUsuarios();
  };

  // =========================
  // ABRIR USUARIOS
  // =========================
  const abrirUsuarios = () => {
    setOpcion("usuarios");
    cargarUsuarios();
  };

  // =========================
  // ABRIR DOCUMENTOS
  // =========================
  const abrirDocumentos = () => {
    setOpcion("documentos");
    cargarEmpleados();
  };

  const abrirContratos = () => {
    setOpcion("contratos");
    cargarEmpleados();
  };

  const abrirObservaciones = () => {
    setOpcion("observaciones");
    cargarEmpleados();
  };

  const empleadosConDocumentos = empleadosFiltrados
    .sort((empleadoA, empleadoB) => {
      const pendientesA = obtenerDocumentosPorCorregir(empleadoA.documentos_revision).length;
      const pendientesB = obtenerDocumentosPorCorregir(empleadoB.documentos_revision).length;
      return pendientesB - pendientesA
        || String(empleadoA.nombre_completo || "").localeCompare(
          String(empleadoB.nombre_completo || ""),
          "es"
        );
    });

  const descargarDocumentoCRD = async (empleado, nombreDocumento) => {
    const clave = `${empleado.id}-${nombreDocumento}`;
    setDescargandoDocumento(clave);
    try {
      const documento = await crearDocumentoEmpleado(empleado, nombreDocumento);
      const href = URL.createObjectURL(documento);
      const enlace = document.createElement("a");
      enlace.href = href;
      enlace.download = documento.name || `${nombreDocumento}_${empleado.cedula}.docx`;
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 1000);
    } catch (error) {
      console.error("Error generando el documento CRD:", error);
      alert(`No se pudo generar "${nombreDocumento}".\n\n${error?.message || "Error inesperado."}`);
    } finally {
      setDescargandoDocumento("");
    }
  };

  // =========================================================
  // DESCARGAR ARCHIVO
  // =========================================================
  const descargarArchivo = async (
    url,
    nombre
  ) => {
    try {
      const respuesta = await fetch(url);

      if (!respuesta.ok) {
        throw new Error(
          "No se pudo obtener el archivo."
        );
      }

      const blob =
        await respuesta.blob();

      const href =
        URL.createObjectURL(blob);

      const enlace =
        document.createElement("a");

      enlace.href = href;
      enlace.download =
        nombre || "archivo";

      document.body.appendChild(enlace);

      enlace.click();

      enlace.remove();

      URL.revokeObjectURL(href);
    } catch (error) {
      console.error(
        "Error descargando archivo:",
        error
      );

      alert(
        "No se pudo descargar el archivo. Revise los permisos o la URL."
      );
    }
  };

  // =========================================================
  // EXTRAER RUTA DE STORAGE
  // =========================================================
  const extraerRutaStorage = (
    valor,
    bucketName
  ) => {
    if (!valor) return null;

    if (typeof valor !== "string") {
      return null;
    }

    const texto = valor.trim();

    if (!texto) return null;

    // Si ya es una ruta relativa:
    // ejemplo:
    // 123456/documentos/cedula_frente.jpg
    if (!texto.startsWith("http")) {
      return texto.replace(/^\/+/, "");
    }

    try {
      const url = new URL(texto);

      const partes =
        url.pathname.split("/");

      /*
        URL típica de Supabase:

        /storage/v1/object/public/
        documentos-empleados/
        123456/cedula.jpg

        o:

        /storage/v1/object/sign/
        documentos-empleados/
        123456/cedula.jpg
      */

      const indiceBucket =
        partes.indexOf(bucketName);

      if (indiceBucket !== -1) {
        const ruta = partes
          .slice(indiceBucket + 1)
          .join("/");

        if (ruta) {
          return decodeURIComponent(ruta);
        }
      }

      // Segundo intento buscando directamente
      // después del nombre del bucket
      const posicion =
        texto.indexOf(
          `${bucketName}/`
        );

      if (posicion !== -1) {
        const ruta =
          texto.substring(
            posicion +
              bucketName.length +
              1
          );

        if (ruta) {
          return decodeURIComponent(
            ruta.split("?")[0]
          );
        }
      }
    } catch (error) {
      console.warn(
        "No se pudo interpretar la URL:",
        valor,
        error
      );
    }

    return null;
  };

  // =========================================================
  // ELIMINAR EMPLEADO
  // =========================================================
  const eliminarEmpleado = async (
    id,
    cedula
  ) => {
    console.log(
      "================================="
    );

    console.log(
      "ELIMINAR EMPLEADO"
    );

    console.log({
      id,
      cedula,
    });

    console.log(
      "================================="
    );

    const confirmar = window.confirm(
      "¿Estás seguro de eliminar este empleado?\n\nSe eliminarán sus documentos de Drive y Storage, su información del Excel y el registro del sistema."
    );

    if (!confirmar) {
      return;
    }

    try {
      // =====================================================
      // 1. BUSCAR EMPLEADO
      // =====================================================

      let empleado = null;

      if (id) {
        const encontrado =
          empleados.find(
            (item) =>
              String(item.id) ===
              String(id)
          );

        if (encontrado) {
          empleado = encontrado;
        }
      }

      if (!empleado && cedula) {
        const encontrado =
          empleados.find(
            (item) =>
              String(item.cedula) ===
              String(cedula)
          );

        if (encontrado) {
          empleado = encontrado;
        }
      }

      // Si no está en el estado local,
      // buscar directamente en Supabase.
      if (!empleado) {
        if (id) {
          const {
            data,
            error,
          } = await supabase
            .from("empleados")
            .select("*")
            .eq("id", id)
            .maybeSingle();

          if (!error && data) {
            empleado = data;
          }
        }
      }

      if (!empleado && cedula) {
        const {
          data,
          error,
        } = await supabase
          .from("empleados")
          .select("*")
          .eq("cedula", cedula)
          .maybeSingle();

        if (!error && data) {
          empleado = data;
        }
      }

      if (!empleado) {
        alert(
          "No se encontró el empleado."
        );
        return;
      }

      console.log(
        "Empleado encontrado:",
        empleado
      );

      // =====================================================
      // 2. OBTENER ID Y CÉDULA REALES
      // =====================================================

      const empleadoId =
        empleado.id || id;

      const empleadoCedula =
        empleado.cedula || cedula;

      console.log(
        "ID definitivo:",
        empleadoId
      );

      console.log(
        "Cédula definitiva:",
        empleadoCedula
      );

      // =====================================================
      // 3. OBTENER ARCHIVOS
      // =====================================================

      const bucketName =
        "documentos-empleados";

      const camposArchivos = [
        "cedula_frente_url",
        "cedula_respaldo_url",
        "certificado_bancario_url",
        "certificado_eps_url",
        "certificado_pension_url",
        "fotografia_url",
        "firma_url",
        "testigo_firma_url",
        "contrato_url",
        "contrato_firmado_url",
      ];

      const rutasStorage = [];

      camposArchivos.forEach(
        (campo) => {
          const valor =
            empleado[campo];

          const ruta =
            extraerRutaStorage(
              valor,
              bucketName
            );

          console.log(
            `Campo ${campo}:`,
            valor
          );

          console.log(
            `Ruta ${campo}:`,
            ruta
          );

          if (ruta) {
            rutasStorage.push(
              ruta
            );
          }
        }
      );

      // Eliminar rutas repetidas
      const rutasUnicas = [
        ...new Set(rutasStorage),
      ];

      console.log(
        "Rutas definitivas de Storage:",
        rutasUnicas
      );

      // =====================================================
      // 4. ELIMINAR ARCHIVOS DE STORAGE
      // =====================================================

      if (
        rutasUnicas.length > 0
      ) {
        console.log(
          "Eliminando archivos de Storage..."
        );

        const {
          data: archivosEliminados,
          error: errorStorage,
        } =
          await supabase.storage
            .from(bucketName)
            .remove(rutasUnicas);

        console.log(
          "Resultado Storage:",
          {
            archivosEliminados,
            errorStorage,
          }
        );

        if (errorStorage) {
          console.error(
            "ERROR STORAGE:",
            errorStorage
          );

          throw new Error(
            "No se pudieron eliminar todos los archivos del Storage. El registro del empleado se conservó."
          );
        }
      } else {
        console.log(
          "Este empleado no tiene archivos para eliminar."
        );
      }

      const { data: sesionAdmin, error: errorSesion } = await supabase.auth.getSession();
      if (errorSesion || !sesionAdmin.session?.access_token) {
        throw new Error("La sesión del administrador expiró. Inicia sesión de nuevo.");
      }

      const apiBase = import.meta.env.VITE_API_URL || "";
      const urlEliminacionDrive = !import.meta.env.DEV && !apiBase
        ? `/.netlify/functions/eliminar-empleado?cedula=${encodeURIComponent(empleadoCedula)}`
        : `${apiBase}/api/empleados/${encodeURIComponent(empleadoCedula)}`;
      const respuestaDrive = await fetch(urlEliminacionDrive, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${sesionAdmin.session.access_token}` },
      });
      const textoRespuestaDrive = await respuestaDrive.text();
      let resultadoDrive = {};
      try {
        resultadoDrive = textoRespuestaDrive ? JSON.parse(textoRespuestaDrive) : {};
      } catch {
        resultadoDrive = {};
      }
      if (!respuestaDrive.ok) {
        if (respuestaDrive.status === 404) {
          throw new Error(
            "No se encontró el servicio para eliminar documentos y limpiar el Excel. Verifica que la función eliminar-empleado esté incluida en el deploy de Netlify."
          );
        }
        throw new Error(
          resultadoDrive.error
            || `No se pudieron eliminar los documentos de Drive y la fila del Excel (HTTP ${respuestaDrive.status}).`
        );
      }

      // =====================================================
      // 5. ELIMINAR REGISTRO DE EMPLEADOS
      // =====================================================

      console.log(
        "Eliminando registro de empleados..."
      );

      let empleadoEliminado =
        false;

      // -----------------------------------------------------
      // PRIMER INTENTO: ID
      // -----------------------------------------------------

      if (empleadoId) {
        console.log(
          "Intentando eliminar por ID:",
          empleadoId
        );

        const {
          data,
          error,
        } = await supabase
          .from("empleados")
          .delete()
          .eq("id", empleadoId)
          .select("id, cedula");

        console.log(
          "Resultado DELETE por ID:",
          {
            data,
            error,
          }
        );

        if (error) {
          console.error(
            "Error DELETE por ID:",
            error
          );
        } else if (
          data &&
          data.length > 0
        ) {
          empleadoEliminado = true;

          console.log(
            "Empleado eliminado por ID correctamente."
          );
        }
      }

      // -----------------------------------------------------
      // SEGUNDO INTENTO: CÉDULA
      // -----------------------------------------------------

      if (
        !empleadoEliminado &&
        empleadoCedula
      ) {
        console.log(
          "Intentando eliminar por cédula:",
          empleadoCedula
        );

        const {
          data,
          error,
        } = await supabase
          .from("empleados")
          .delete()
          .eq(
            "cedula",
            empleadoCedula
          )
          .select("id, cedula");

        console.log(
          "Resultado DELETE por cédula:",
          {
            data,
            error,
          }
        );

        if (error) {
          console.error(
            "Error DELETE por cédula:",
            error
          );
        } else if (
          data &&
          data.length > 0
        ) {
          empleadoEliminado = true;

          console.log(
            "Empleado eliminado por cédula correctamente."
          );
        }
      }

      // =====================================================
      // 6. VERIFICAR
      // =====================================================

      if (!empleadoEliminado) {
        console.error(
          "NO SE ELIMINÓ NINGÚN REGISTRO."
        );

        alert(
          "El empleado NO fue eliminado de la base de datos.\n\nEsto normalmente significa que Supabase está bloqueando el DELETE mediante RLS."
        );

        await cargarEmpleados();

        return;
      }

      // =====================================================
      // 7. ACTUALIZAR LA TABLA SIN ESPERAR
      // =====================================================

      setEmpleados(
        (anteriores) =>
          anteriores.filter(
            (item) => {
              if (
                empleadoId &&
                String(item.id) ===
                  String(empleadoId)
              ) {
                return false;
              }

              if (
                empleadoCedula &&
                String(
                  item.cedula
                ) ===
                  String(
                    empleadoCedula
                  )
              ) {
                return false;
              }

              return true;
            }
          )
      );

      // =====================================================
      // 8. RECARGAR DESDE SUPABASE
      // =====================================================

      await cargarEmpleados();

      alert(
        "Empleado eliminado correctamente.\n\nSe eliminaron los documentos de Drive y Storage, y se limpiaron sus datos en el Excel."
      );

      console.log(
        "Empleado eliminado correctamente."
      );
    } catch (error) {
      console.error(
        "ERROR GENERAL AL ELIMINAR:",
        error
      );

      alert(
        "Ocurrió un error al eliminar el empleado. Revisa la consola."
      );

      await cargarEmpleados();
    }
  };

  // =========================================================
  // RENDER
  // =========================================================

  return (
    <div
      className="admin-layout"
      style={{
        minHeight: "100vh",
        background: "#F5F8FA",
        display: "flex",
      }}
    >
      {/* =====================================================
          PANEL LATERAL
      ====================================================== */}

      <aside
        className="admin-sidebar"
        style={{
          width: "240px",
          minHeight: "100vh",
          background: "#FFFFFF",
          boxShadow:
            "3px 0 15px rgba(0,0,0,0.08)",
          padding: "25px 15px",
          boxSizing: "border-box",
          position: "sticky",
          top: 0,
          height: "100vh",
        }}
      >
        <div
          style={{
            textAlign: "center",
            marginBottom: "18px",
          }}
        >
          <h2
            style={{
              margin: 0,
              color: "#3187B5",
              fontSize: "20px",
            }}
          >
            Administrador
          </h2>
        </div>

        {/* EMPLEADOS */}

        <button
          onClick={() =>
            setOpcion("empleados")
          }
          style={{
            width: "100%",
            padding: "14px",
            marginBottom: "10px",
            border: "none",
            borderRadius: "10px",
            cursor: "pointer",
            textAlign: "left",
            fontWeight: "700",
            fontSize: "14px",
            background:
              opcion === "empleados"
                ? "linear-gradient(135deg, #8BC34A, #3187B5)"
                : "#F5F8FA",
            color:
              opcion === "empleados"
                ? "#FFFFFF"
                : "#455A64",
          }}
        >
          Empleados
        </button>

        {/* USUARIOS */}

        <button
          onClick={abrirUsuarios}
          style={{
            width: "100%",
            padding: "14px",
            marginBottom: "10px",
            border: "none",
            borderRadius: "10px",
            cursor: "pointer",
            textAlign: "left",
            fontWeight: "700",
            fontSize: "14px",
            background:
              opcion === "usuarios"
                ? "linear-gradient(135deg, #8BC34A, #3187B5)"
                : "#F5F8FA",
            color:
              opcion === "usuarios"
                ? "#FFFFFF"
                : "#455A64",
          }}
        >
          Usuarios autorizados
        </button>

        {/* DOCUMENTOS */}

        <button
          onClick={abrirDocumentos}
          style={{
            width: "100%",
            padding: "14px",
            marginBottom: "10px",
            border: "none",
            borderRadius: "10px",
            cursor: "pointer",
            textAlign: "left",
            fontWeight: "700",
            fontSize: "14px",
            background:
              opcion === "documentos"
                ? "linear-gradient(135deg, #8BC34A, #3187B5)"
                : "#F5F8FA",
            color:
              opcion === "documentos"
                ? "#FFFFFF"
                : "#455A64",
          }}
        >
          Documentos
        </button>

        <button
          onClick={() => {
            setOpcion("documentos-crd");
            cargarEmpleados();
          }}
          style={{
            width: "100%",
            padding: "14px",
            marginBottom: "10px",
            border: "none",
            borderRadius: "10px",
            cursor: "pointer",
            textAlign: "left",
            fontWeight: "700",
            fontSize: "14px",
            background:
              opcion === "documentos-crd"
                ? "linear-gradient(135deg, #8BC34A, #3187B5)"
                : "#F5F8FA",
            color:
              opcion === "documentos-crd"
                ? "#FFFFFF"
                : "#455A64",
          }}
        >
          Documentos CRD
        </button>

        <button
          onClick={abrirObservaciones}
          style={{
            width: "100%",
            padding: "14px",
            marginBottom: "10px",
            border: "none",
            borderRadius: "10px",
            cursor: "pointer",
            textAlign: "left",
            fontWeight: "700",
            fontSize: "14px",
            background: opcion === "observaciones" ? "linear-gradient(135deg, #8BC34A, #3187B5)" : "#F5F8FA",
            color: opcion === "observaciones" ? "#FFFFFF" : "#455A64",
          }}
        >
          Observaciones
        </button>

        <button
          onClick={abrirContratos}
          style={{
            width: "100%",
            padding: "14px",
            marginBottom: "10px",
            border: "none",
            borderRadius: "10px",
            cursor: "pointer",
            textAlign: "left",
            fontWeight: "700",
            fontSize: "14px",
            background: opcion === "contratos" ? "linear-gradient(135deg, #8BC34A, #3187B5)" : "#F5F8FA",
            color: opcion === "contratos" ? "#FFFFFF" : "#455A64",
          }}
        >
          Contratos
        </button>

        <div
          style={{
            borderTop:
              "1px solid #E5E9EC",
            margin: "25px 0",
          }}
        />

        {/* CERRAR SESIÓN */}

        <button
          onClick={cerrarSesion}
          style={{
            width: "100%",
            padding: "13px",
            background: "#E53935",
            color: "white",
            border: "none",
            borderRadius: "8px",
            fontWeight: "700",
            cursor: "pointer",
          }}
        >
          CERRAR SESIÓN
        </button>
      </aside>

      {/* =====================================================
          CONTENIDO PRINCIPAL
      ====================================================== */}

      <main
        className="admin-content"
        style={{
          flex: 1,
          padding: "30px",
          boxSizing: "border-box",
          overflow: "hidden",
        }}
      >
        {/* =====================================================
            EMPLEADOS
        ====================================================== */}

        {opcion === "empleados" && (
          <>
            {/* ENCABEZADO */}

            <EncabezadoAdmin descripcion="Panel de administración · Gestión de empleados" />

            {/* CONTROLES */}

            <div
              className="admin-toolbar-card"
              style={{
                background: "#FFFFFF",
                borderRadius: "15px",
                padding: "20px",
                marginBottom: "25px",
                boxShadow:
                  "0 5px 20px rgba(0,0,0,0.08)",
              }}
            >
              <div
                className="admin-toolbar"
                style={{
                  display: "flex",
                  gap: "15px",
                  flexWrap: "wrap",
                }}
              >
                <input
                  type="text"
                  placeholder="Buscar por nombre o cédula..."
                  value={busqueda}
                  onChange={(e) =>
                    setBusqueda(
                      e.target.value
                    )
                  }
                  style={{
                    flex: 1,
                    minWidth: "220px",
                      height: "42px",
                      padding: "0 12px",
                    border:
                      "1px solid #D5DDE2",
                    borderRadius: "8px",
                    fontSize: "14px",
                    boxSizing:
                      "border-box",
                    outline: "none",
                  }}
                />
                <label className="admin-project-filter">
                  <select
                    value={proyectoFiltro}
                    onChange={(event) => setProyectoFiltro(event.target.value)}
                    aria-label="Filtrar empleados por proyecto"
                  >
                    <option value="">Proyecto: todos</option>
                    {proyectosEmpleados.map((proyecto) => (
                      <option key={normalizarBusqueda(proyecto)} value={proyecto}>
                        {proyecto}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="admin-result-count">
                  {empleadosFiltrados.length} empleados
                </span>

                <button
                  onClick={descargarExcel}
                  style={{
                    height: "45px",
                    padding: "0 20px",
                    background: "#6BAA45",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    fontWeight: "700",
                    cursor: "pointer",
                  }}
                >
                  DESCARGAR EXCEL
                </button>

                <button
                  onClick={sincronizarEmpleados}
                  disabled={sincronizandoEmpleados}
                  style={{
                    height: "45px",
                    padding: "0 20px",
                    background: sincronizandoEmpleados ? "#8295A0" : "#3B7A57",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    fontWeight: "700",
                    cursor: sincronizandoEmpleados ? "not-allowed" : "pointer",
                  }}
                >
                  {sincronizandoEmpleados ? "SINCRONIZANDO..." : "SUBIR A DRIVE Y EXCEL"}
                </button>

                <button
                  onClick={cargarEmpleados}
                  style={{
                    height: "45px",
                    padding: "0 20px",
                    background: "#3187B5",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    fontWeight: "700",
                    cursor: "pointer",
                  }}
                >
                  ACTUALIZAR
                </button>
              </div>
              {progresoSincronizacion && (
                <p role="status" style={{ margin: "12px 0 0", color: "#607D8B" }}>
                  {progresoSincronizacion}
                </p>
              )}
            </div>

            {/* TABLA */}

            <div
              className="admin-employee-table"
              style={{
                background: "#FFFFFF",
                borderRadius: "15px",
                boxShadow:
                  "0 5px 20px rgba(0,0,0,0.08)",
                overflowX: "auto",
              }}
            >
              {cargando ? (
                <div
                  style={{
                    padding: "50px",
                    textAlign: "center",
                    color: "#607D8B",
                  }}
                >
                  Cargando empleados...
                </div>
              ) : empleadosFiltrados.length ===
                0 ? (
                <div
                  style={{
                    padding: "50px",
                    textAlign: "center",
                    color: "#607D8B",
                  }}
                >
                  No hay empleados
                  registrados.
                </div>
              ) : (
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "separate",
                    borderSpacing: 0,
                    minWidth: "2200px",
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        background:
                          "linear-gradient(135deg, #8BC34A, #3187B5)",
                        color: "white",
                      }}
                    >
                      {columnasEmpleado.slice(0, 2).map(
                        ({ label }, index) => (
                          <th
                            key={label}
                            style={index === 0
                              ? estiloEncabezadoFijoEmpleados(0, 150)
                              : estiloEncabezadoFijoEmpleados(150, 220, true)}
                          >
                            {label}
                          </th>
                        )
                      )}

                      <th style={estiloEncabezadoFijoEmpleados(370, 220, true)}>
                        PROYECTO
                      </th>
                      <th style={estiloAccionFijaEncabezado}>
                        ACCIÓN
                      </th>
                      {columnasEmpleado.slice(2).filter(({ key }) => key !== "proyecto").map(({ label }) => (
                        <th key={label} style={estiloEncabezadoEmpleados}>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {empleadosPaginados.map((empleado) => ([
                      <tr
                        key={empleado.id || empleado.cedula}
                      >
                        {columnasEmpleado.slice(0, 2).map(({ key, label }, index) => (
                          <td
                            key={`${empleado.id || empleado.cedula}-${label}`}
                            style={index === 0
                              ? estiloColumnaFijaEmpleados(0, 150)
                              : estiloColumnaFijaEmpleados(150, 220, true)}
                          >
                            {key === "nombre_completo"
                              ? formatearNombrePropio(valorCampoEmpleado(empleado, key))
                              : valorCampoEmpleado(empleado, key)}
                          </td>
                        ))}

                        <td style={estiloColumnaFijaEmpleados(370, 220, true)}>
                          {valorCampoEmpleado(empleado, "proyecto") || "—"}
                        </td>
                        <td style={estiloAccionFijaColumna}>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <button
                              type="button"
                              onClick={() => eliminarEmpleado(empleado.id, empleado.cedula)}
                              style={{
                                background: "#E53935",
                                color: "white",
                                border: "none",
                                borderRadius: "6px",
                                padding: "8px 12px",
                                cursor: "pointer",
                                fontWeight: "700",
                              }}
                            >
                              ELIMINAR
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                console.log('EDITAR ADMIN click', empleado.id);
                                setEditingEmpleadoId(String(empleado.id));
                                setAdminForm(adminFormDeEmpleado(empleado));
                              }}
                              style={{
                                background: '#6BAA45',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                padding: '8px 12px',
                                cursor: 'pointer',
                                fontWeight: '700'
                              }}
                            >
                              EDITAR
                            </button>

                          </div>
                        </td>
                        {columnasEmpleado.slice(2).filter(({ key }) => key !== "proyecto").map(({ key, label }) => (
                          <td
                            key={`${empleado.id || empleado.cedula}-${label}`}
                            style={estiloTd}
                          >
                            {key === "nombre_completo"
                              ? formatearNombrePropio(valorCampoEmpleado(empleado, key))
                              : valorCampoEmpleado(empleado, key)}
                          </td>
                        ))}
                      </tr>,

                      String(editingEmpleadoId) === String(empleado.id) ? (
                        <tr key={`edit-${empleado.id}`}>
                          <td colSpan={columnasEmpleado.length + 1} style={{ padding: 0, border: 0 }}>
                            <div style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(20, 35, 45, 0.68)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                              <div style={{ width: 'min(980px, 100%)', maxHeight: '92vh', overflowY: 'auto', background: '#FFFFFF', borderRadius: '14px', padding: '24px', boxShadow: '0 18px 55px rgba(0,0,0,0.3)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
                                  <div>
                                    <h2 style={{ margin: 0, color: '#3187B5', fontSize: '22px' }}>Editar datos del contrato</h2>
                                    <p style={{ margin: '6px 0 0', color: '#607D8B' }}>{formatearNombrePropio(empleado.nombre_completo)} · {empleado.cedula}</p>
                                  </div>
                                  <button type="button" onClick={() => setEditingEmpleadoId(null)} aria-label="Cerrar edición" style={{ border: 0, background: 'transparent', color: '#455A64', fontSize: '28px', cursor: 'pointer', lineHeight: 1 }}>×</button>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', alignItems: 'center' }}>

                              <SelectItemCargo
                                adminForm={adminForm}
                                cambiarItem={cambiarItemAdmin}
                                cambiarCargo={cambiarCargoAdmin}
                                estiloLabel={estiloLabel}
                                estiloInput={estiloInput}
                              />

                              <div>
                                <label style={estiloLabel}>Proyecto</label>
                                <select
                                  value={adminForm.proyecto || ''}
                                  onChange={(e) => setAdminForm((p) => ({ ...p, proyecto: e.target.value }))}
                                  style={estiloInput}
                                >
                                  <option value="">Seleccione un proyecto</option>
                                  {adminForm.proyecto && !PROYECTOS.includes(adminForm.proyecto) && (
                                    <option value={adminForm.proyecto}>{adminForm.proyecto}</option>
                                  )}
                                  {PROYECTOS.map((proyecto) => (
                                    <option key={proyecto} value={proyecto}>{proyecto}</option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label style={estiloLabel}>Lugar donde desempeñará las labores</label>
                                <input
                                  type="text"
                                  value={adminForm.lugar_desempeno_labores || ""}
                                  onChange={(e) => setAdminForm((p) => ({ ...p, lugar_desempeno_labores: e.target.value }))}
                                  style={estiloInput}
                                />
                              </div>

                              <div>
                                <label style={estiloLabel}>Lugar donde ha sido contratado el trabajador</label>
                                <input
                                  type="text"
                                  value={adminForm.lugar_contratacion || ""}
                                  onChange={(e) => setAdminForm((p) => ({ ...p, lugar_contratacion: e.target.value }))}
                                  style={estiloInput}
                                />
                              </div>

                              <div>
                                <label style={estiloLabel}>Frente de obra</label>
                                <input
                                  type="text"
                                  value={adminForm.frente_obra || ""}
                                  onChange={(e) => setAdminForm((p) => ({ ...p, frente_obra: e.target.value }))}
                                  style={estiloInput}
                                />
                              </div>

                              <div>
                                <label style={estiloLabel}>Salario día</label>
                                <input
                                  type="number"
                                  value={adminForm.salario_basico || ''}
                                  onChange={(e) => setAdminForm((p) => ({ ...p, salario_basico: e.target.value }))}
                                  style={estiloInput}
                                />
                              </div>

                              <div>
                                <label style={estiloLabel}>Auxilio De Alimentación</label>
                                <input
                                  type="number"
                                  value={adminForm.auxilio_1 || ''}
                                  onChange={(e) => setAdminForm((p) => ({ ...p, auxilio_1: e.target.value }))}
                                  style={estiloInput}
                                />
                              </div>

                              <div>
                                <label style={estiloLabel}>Auxilio  De Vivienda</label>
                                <input
                                  type="number"
                                  value={adminForm.auxilio_2 || ''}
                                  onChange={(e) => setAdminForm((p) => ({ ...p, auxilio_2: e.target.value }))}
                                  style={estiloInput}
                                />
                              </div>

                              <div>
                                <label style={estiloLabel}>Bono productividad</label>
                                <input
                                  type="number"
                                  value={adminForm.bono_productividad || ''}
                                  onChange={(e) => setAdminForm((p) => ({ ...p, bono_productividad: e.target.value }))}
                                  style={estiloInput}
                                />
                              </div>

                              <div>
                                <label style={estiloLabel}>Bono mera liberalidad</label>
                                <input
                                  type="number"
                                  value={adminForm.bono_mera_liberalidad || ''}
                                  onChange={(e) => setAdminForm((p) => ({ ...p, bono_mera_liberalidad: e.target.value }))}
                                  style={estiloInput}
                                />
                              </div>

                              <div>
                                <label style={estiloLabel}>Fecha inicio contrato</label>
                                <input
                                  type="date"
                                  value={adminForm.fecha_inicio_contrato || ''}
                                  onChange={(e) => setAdminForm((p) => ({ ...p, fecha_inicio_contrato: e.target.value }))}
                                  style={estiloInput}
                                />
                              </div>

                              <div style={{ gridColumn: 'span 2' }}>
                                <label style={estiloLabel}>Objeto de contrato</label>
                                <textarea
                                  value={adminForm.objeto_contrato || ''}
                                  onChange={(e) => setAdminForm((p) => ({ ...p, objeto_contrato: e.target.value }))}
                                  placeholder="Escriba el objeto del contrato"
                                  style={{ ...estiloInput, height: '90px', paddingTop: '12px', resize: 'vertical' }}
                                />
                              </div>

                              <div style={{ display: 'flex', gap: '8px', alignItems: 'end' }}>
                                <button
                                  type="button"
                                  disabled={subiendoContratoId === empleado.id}
                                  onClick={() => void guardarEdicionEmpleado(empleado)}
                                  style={{
                                    background: subiendoContratoId === empleado.id ? '#8295A0' : '#6BAA45',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    padding: '8px 12px',
                                    cursor: subiendoContratoId === empleado.id ? 'wait' : 'pointer',
                                    fontWeight: '700'
                                  }}
                                >
                                  {subiendoContratoId === empleado.id ? 'GUARDANDO...' : 'GUARDAR'}
                                </button>

                                <button
                                  type="button"
                                  disabled={subiendoContratoId === empleado.id}
                                  onClick={() => void previsualizarContrato(empleado)}
                                  style={{
                                    background: '#3187B5',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    padding: '8px 12px',
                                    cursor: subiendoContratoId === empleado.id ? 'wait' : 'pointer',
                                    fontWeight: '700'
                                  }}
                                >
                                  GUARDAR Y VER CONTRATO
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setEditingEmpleadoId(null)}
                                  style={{
                                    background: '#E0E0E0',
                                    color: '#263238',
                                    border: 'none',
                                    borderRadius: '6px',
                                    padding: '8px 12px',
                                    cursor: 'pointer',
                                    fontWeight: '700'
                                  }}
                                >
                                  CANCELAR
                                </button>
                              </div>

                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null
                    ]))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="admin-employee-cards">
              {cargando ? (
                <div className="admin-employee-card-message">Cargando empleados...</div>
              ) : empleadosFiltrados.length === 0 ? (
                <div className="admin-employee-card-message">
                  {empleados.length === 0
                    ? "No hay empleados registrados."
                    : "No hay empleados que coincidan con la búsqueda."}
                </div>
              ) : empleadosPaginados.map((empleado) => (
                <article
                  className="admin-employee-card"
                  key={`mobile-${empleado.id || empleado.cedula}`}
                >
                  <h2>{formatearNombrePropio(empleado.nombre_completo) || "Sin nombre"}</h2>
                  <div className="admin-employee-card-actions">
                    <button
                      type="button"
                      className="admin-employee-card-delete"
                      onClick={() => eliminarEmpleado(empleado.id, empleado.cedula)}
                    >
                      ELIMINAR
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingEmpleadoId(String(empleado.id));
                        setAdminForm(adminFormDeEmpleado(empleado));
                      }}
                    >
                      EDITAR
                    </button>
                  </div>
                  <div className="admin-employee-card-fields">
                    {columnasEmpleado.map(({ key, label }) => (
                      <div className="admin-employee-card-field" key={key}>
                        <strong>{label}</strong>
                        <span>
                          {key === "nombre_completo"
                            ? formatearNombrePropio(valorCampoEmpleado(empleado, key)) || "—"
                            : valorCampoEmpleado(empleado, key) || "—"}
                        </span>
                      </div>
                    ))}
                  </div>

                  {String(editingEmpleadoId) === String(empleado.id) && (
                    <div className="admin-employee-card-editor">
                      <h3>Editar datos del contrato</h3>
                      <SelectItemCargo
                        adminForm={adminForm}
                        cambiarItem={cambiarItemAdmin}
                        cambiarCargo={cambiarCargoAdmin}
                        estiloLabel={{ display: "block", fontWeight: 700 }}
                        estiloInput={{ width: "100%" }}
                      />
                      {[
                        { key: "proyecto", label: "Proyecto", type: "select" },
                        { key: "lugar_desempeno_labores", label: "Lugar donde desempeñará las labores", type: "text" },
                        { key: "lugar_contratacion", label: "Lugar donde ha sido contratado el trabajador", type: "text" },
                        { key: "frente_obra", label: "Frente de obra", type: "text" },
                        { key: "salario_basico", label: "Salario día", type: "number" },
                        { key: "auxilio_1", label: "Auxilio de alimentación", type: "number" },
                        { key: "auxilio_2", label: "Auxilio de vivienda", type: "number" },
                        { key: "bono_productividad", label: "Bono productividad", type: "number" },
                        { key: "bono_mera_liberalidad", label: "Bono mera liberalidad", type: "number" },
                        { key: "fecha_inicio_contrato", label: "Fecha inicio contrato", type: "date" },
                      ].map(({ key, label, type }) => (
                        <label className="admin-employee-card-input" key={key}>
                          <span>{label}</span>
                          {type === "select" ? (
                            <select
                              value={adminForm[key] || ""}
                              onChange={(event) => setAdminForm((previous) => ({
                                ...previous,
                                [key]: event.target.value,
                              }))}
                            >
                              <option value="">Seleccione un proyecto</option>
                              {adminForm[key] && !PROYECTOS.includes(adminForm[key]) && (
                                <option value={adminForm[key]}>{adminForm[key]}</option>
                              )}
                              {PROYECTOS.map((proyecto) => (
                                <option key={proyecto} value={proyecto}>{proyecto}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type={type}
                              value={adminForm[key] || ""}
                              onChange={(event) => setAdminForm((previous) => ({
                                ...previous,
                                [key]: event.target.value,
                              }))}
                            />
                          )}
                        </label>
                      ))}
                      <label className="admin-employee-card-input">
                        <span>Objeto del contrato</span>
                        <textarea
                          value={adminForm.objeto_contrato || ""}
                          onChange={(event) => setAdminForm((previous) => ({
                            ...previous,
                            objeto_contrato: event.target.value,
                          }))}
                          placeholder="Escriba el objeto del contrato"
                        />
                      </label>
                      <div className="admin-employee-card-actions">
                        <button
                          type="button"
                          disabled={subiendoContratoId === empleado.id}
                          onClick={() => void guardarEdicionEmpleado(empleado)}
                        >
                          {subiendoContratoId === empleado.id ? "GUARDANDO..." : "GUARDAR"}
                        </button>
                        <button
                          type="button"
                          disabled={subiendoContratoId === empleado.id}
                          onClick={() => void previsualizarContrato(empleado)}
                        >
                          GUARDAR Y VER CONTRATO
                        </button>
                        <button
                          type="button"
                          className="admin-employee-card-cancel"
                          onClick={() => setEditingEmpleadoId(null)}
                        >
                          CANCELAR
                        </button>
                      </div>
                    </div>
                  )}

                </article>
              ))}
            </div>
            <Paginacion
              cantidad={empleadosFiltrados.length}
              pagina={paginaActual}
              cambiarPagina={cambiarPagina}
            />
          </>
        )}

        {/* =====================================================
            USUARIOS AUTORIZADOS
        ====================================================== */}

        {opcion === "usuarios" && (
          <>
            <EncabezadoAdmin descripcion="Panel de administración · Usuarios autorizados" />

            <FiltroPorPersona
              busqueda={busqueda}
              cambiarBusqueda={setBusqueda}
              cantidad={usuariosFiltrados.length}
              etiqueta="usuarios"
            />

            {/* CREAR USUARIO */}

            <div
              className="admin-create-user-card"
              style={{
                background: "#FFFFFF",
                borderRadius: "15px",
                padding: "25px",
                marginBottom: "25px",
                boxShadow:
                  "0 5px 20px rgba(0,0,0,0.08)",
              }}
            >
              <h2
                style={{
                  marginTop: 0,
                  color: "#263238",
                  fontSize: "20px",
                }}
              >
                Crear usuario
              </h2>

              <form
                onSubmit={crearUsuario}
              >
                <div
                  className="admin-create-user-grid"
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "1fr 2fr auto",
                    gap: "15px",
                    alignItems:
                      "end",
                  }}
                >
                  <div>
                    <label
                      style={
                        estiloLabel
                      }
                    >
                      CÉDULA
                    </label>

                    <input
                      type="text"
                      value={
                        cedulaUsuario
                      }
                      onChange={(e) =>
                        setCedulaUsuario(
                          e.target.value
                        )
                      }
                      placeholder="Ingrese la cédula"
                      style={
                        estiloInput
                      }
                    />
                  </div>

                  <div>
                    <label
                      style={
                        estiloLabel
                      }
                    >
                      NOMBRE COMPLETO
                    </label>

                    <input
                      type="text"
                      value={
                        nombreUsuario
                      }
                      onChange={(e) =>
                        setNombreUsuario(
                          e.target.value
                        )
                      }
                      placeholder="Ingrese el nombre completo"
                      style={
                        estiloInput
                      }
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={
                      guardandoUsuario
                    }
                    style={{
                      height: "45px",
                      padding:
                        "0 25px",
                      background:
                        "#6BAA45",
                      color: "white",
                      border: "none",
                      borderRadius:
                        "8px",
                      fontWeight:
                        "700",
                      cursor:
                        "pointer",
                    }}
                  >
                    {guardandoUsuario
                      ? "GUARDANDO..."
                      : "CREAR USUARIO"}
                  </button>
                </div>
              </form>
            </div>

            {/* LISTADO */}

            <div
              className="admin-list-card"
              style={{
                background: "#FFFFFF",
                borderRadius: "15px",
                boxShadow:
                  "0 5px 20px rgba(0,0,0,0.08)",
                overflow: "hidden",
              }}
            >
              <div
                className="admin-list-header"
                style={{
                  padding: "20px",
                  borderBottom:
                    "1px solid #E5E9EC",
                  display: "flex",
                  justifyContent:
                    "space-between",
                  alignItems:
                    "center",
                }}
              >
                <div>
                  <strong>
                    Usuarios autorizados
                  </strong>

                  <span
                    style={{
                      marginLeft: "10px",
                      background:
                        "#E8F5E9",
                      color:
                        "#388E3C",
                      padding:
                        "5px 10px",
                      borderRadius:
                        "20px",
                      fontWeight:
                        "700",
                    }}
                  >
                    {usuariosFiltrados.length}
                  </span>
                </div>

                <button
                  onClick={
                    cargarUsuarios
                  }
                  style={{
                    height: "38px",
                    padding:
                      "0 15px",
                    background:
                      "#3187B5",
                    color: "white",
                    border: "none",
                    borderRadius:
                      "8px",
                    fontWeight:
                      "700",
                    cursor:
                      "pointer",
                  }}
                >
                  ACTUALIZAR
                </button>
              </div>

              {cargandoUsuarios ? (
                <div
                  style={{
                    padding: "40px",
                    textAlign:
                      "center",
                    color:
                      "#607D8B",
                  }}
                >
                  Cargando usuarios...
                </div>
              ) : usuarios.length ===
                0 ? (
                <div
                  style={{
                    padding: "40px",
                    textAlign:
                      "center",
                    color:
                      "#607D8B",
                  }}
                >
                  No hay usuarios
                  autorizados registrados.
                </div>
              ) : usuariosFiltrados.length === 0 ? (
                <div className="admin-empty-filter" role="status">
                  No hay usuarios que coincidan con la búsqueda.
                </div>
              ) : (
                <div className="admin-users-table" style={{ overflowX: "auto" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse:
                        "collapse",
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          background:
                            "linear-gradient(135deg, #8BC34A, #3187B5)",
                          color:
                            "white",
                        }}
                      >
                        <th
                          style={
                            estiloTh
                          }
                        >
                          CÉDULA
                        </th>

                        <th
                          style={
                            estiloTh
                          }
                        >
                          NOMBRE COMPLETO
                        </th>

                        <th
                          style={
                            estiloTh
                          }
                        >
                          ACCIÓN
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {usuariosPaginados.map(
                        (usuario) => (
                          <tr
                            key={
                              usuario.id
                            }
                          >
                            <td
                              style={
                                estiloTd
                              }
                            >
                              {
                                usuario.cedula
                              }
                            </td>

                            <td
                              style={
                                estiloTd
                              }
                            >
                              {formatearNombrePropio(usuario.nombre_completo)}
                            </td>

                            <td
                              style={
                                estiloTd
                              }
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  eliminarUsuario(
                                    usuario.id,
                                    usuario.cedula
                                  )
                                }
                                style={{
                                  background:
                                    "#E53935",
                                  color:
                                    "white",
                                  border:
                                    "none",
                                  borderRadius:
                                    "6px",
                                  padding:
                                    "8px 14px",
                                  cursor:
                                    "pointer",
                                  fontWeight:
                                    "700",
                                }}
                              >
                                ELIMINAR
                              </button>
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            {!cargandoUsuarios && usuariosFiltrados.length > 0 && (
              <div className="admin-mobile-cards">
                {usuariosPaginados.map((usuario) => (
                  <article className="admin-mobile-card" key={`mobile-${usuario.id}`}>
                    <h2>{formatearNombrePropio(usuario.nombre_completo) || "Sin nombre"}</h2>
                    <button
                      type="button"
                      className="admin-mobile-button admin-mobile-button-danger"
                      onClick={() => eliminarUsuario(usuario.id, usuario.cedula)}
                    >
                      ELIMINAR USUARIO
                    </button>
                    <p><strong>Cédula:</strong> {usuario.cedula || "—"}</p>
                  </article>
                ))}
              </div>
            )}
            <Paginacion
              cantidad={usuariosFiltrados.length}
              pagina={paginaActual}
              cambiarPagina={cambiarPagina}
            />
          </>
        )}

        {/* =====================================================
            DOCUMENTOS
        ====================================================== */}

        {opcion === "documentos" && (
          <div>
            <EncabezadoAdmin descripcion="Panel de administración · Documentos cargados">
              <button
                type="button"
                onClick={cargarEmpleados}
                style={{
                  height: "42px",
                  padding: "0 16px",
                  background: "#3187B5",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  fontWeight: "700",
                  cursor: "pointer",
                }}
              >
                Actualizar documentos
              </button>
            </EncabezadoAdmin>

            <FiltroPorPersona
              busqueda={busqueda}
              cambiarBusqueda={setBusqueda}
              cantidad={empleadosFiltrados.length}
              etiqueta="empleados"
            />

            <div
              className="admin-documents-table"
              style={{
                background: "#FFFFFF",
                borderRadius: "15px",
                boxShadow:
                  "0 5px 20px rgba(0,0,0,0.08)",
                overflowX: "auto",
              }}
            >
              {cargando ? (
                <div
                  style={{
                    padding: "50px",
                    textAlign:
                      "center",
                    color:
                      "#607D8B",
                  }}
                >
                  Cargando empleados...
                </div>
              ) : empleadosFiltrados.length ===
                0 ? (
                <div
                  style={{
                    padding: "50px",
                    textAlign:
                      "center",
                    color:
                      "#607D8B",
                  }}
                >
                  {empleados.length === 0
                    ? "No hay empleados registrados."
                    : "No hay empleados que coincidan con la búsqueda."}
                </div>
              ) : (
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "separate",
                    borderSpacing: 0,
                    tableLayout: "fixed",
                    minWidth: "1500px",
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        background:
                          "linear-gradient(135deg, #8BC34A, #3187B5)",
                        color:
                          "white",
                      }}
                    >
                      <th
                        style={estiloEncabezadoFijoDocumentos(0, 150)}
                      >
                        CÉDULA
                      </th>

                      <th
                        style={estiloEncabezadoFijoDocumentos(150, 220, true)}
                      >
                        NOMBRE
                      </th>

                      <th
                        style={estiloEncabezadoDocumentos}
                      >
                        CÉDULA FRENTE
                      </th>

                      <th
                        style={estiloEncabezadoDocumentos}
                      >
                        CÉDULA RESPALDO
                      </th>

                      <th
                        style={estiloEncabezadoDocumentos}
                      >
                        CERTIFICADO BANCARIO
                      </th>

                      <th
                        style={estiloEncabezadoDocumentos}
                      >
                        CERTIFICADO EPS
                      </th>

                      <th
                        style={estiloEncabezadoDocumentos}
                      >
                        CERTIFICADO PENSIÓN
                      </th>

                      <th
                        style={estiloEncabezadoDocumentos}
                      >
                        FOTOGRAFÍA
                      </th>

                      <th style={estiloEncabezadoDocumentos}>CONTRATO</th>
                    </tr>
                  </thead>

                  <tbody>
                    {empleadosPaginados.map(
                      (emp) => (
                        <tr
                          key={
                            emp.id ||
                            emp.cedula
                          }
                        >
                          <td
                            style={estiloColumnaFijaDocumentos(0, 150)}
                          >
                            {emp.cedula}
                          </td>

                          <td
                            style={estiloColumnaFijaDocumentos(150, 220, true)}
                          >
                            {
                              formatearNombrePropio(emp.nombre_completo)
                            }
                          </td>

                          <CeldaArchivo
                            url={
                              emp.cedula_frente_url
                            }
                            nombre={`cedula_frente_${emp.cedula}`}
                            descargarArchivo={
                              descargarArchivo
                            }
                            compacto
                          />

                          <CeldaArchivo
                            url={
                              emp.cedula_respaldo_url
                            }
                            nombre={`cedula_respaldo_${emp.cedula}`}
                            descargarArchivo={
                              descargarArchivo
                            }
                            compacto
                          />

                          <CeldaArchivo
                            url={
                              emp.certificado_bancario_url
                            }
                            nombre={`certificado_bancario_${emp.cedula}`}
                            descargarArchivo={
                              descargarArchivo
                            }
                            compacto
                          />

                          <CeldaArchivo
                            url={
                              emp.certificado_eps_url
                            }
                            nombre={`certificado_eps_${emp.cedula}`}
                            descargarArchivo={
                              descargarArchivo
                            }
                            compacto
                          />

                          <CeldaArchivo
                            url={
                              emp.certificado_pension_url
                            }
                            nombre={`certificado_pension_${emp.cedula}`}
                            descargarArchivo={
                              descargarArchivo
                            }
                            compacto
                          />

                          <CeldaArchivo
                            url={
                              emp.fotografia_url
                            }
                            nombre={`fotografia_${emp.cedula}`}
                            descargarArchivo={
                              descargarArchivo
                            }
                            compacto
                          />

                          <td style={estiloTdDocumentos}>
                            <div>
                              {emp.contrato_estado === "firmado"
                                ? "Contrato final publicado"
                                : emp.contrato_url
                                  ? "Borrador pendiente de publicar"
                                  : "Sin publicar"}
                            </div>
                            {emp.contrato_url && (
                              <div style={bloqueContratoStyle}>
                                <strong style={tituloContratoStyle}>
                                  {emp.contrato_estado === "firmado" ? "Contrato final publicado" : "Borrador del contrato"}
                                </strong>
                                <button
                                  type="button"
                                  onClick={() => window.open(emp.contrato_url, "_blank", "noopener")}
                                  style={{
                                    background: "white",
                                    border: "1px solid #3187B5",
                                    color: "#3187B5",
                                    borderRadius: "6px",
                                    padding: "6px 8px",
                                    cursor: "pointer",
                                    fontWeight: "700",
                                  }}
                                >
                                  {emp.contrato_estado === "firmado" ? "Abrir contrato publicado" : "Abrir archivo del contrato"}
                                </button>
                              </div>
                            )}
                            {emp.contrato_firmado_url && (
                              <div style={{ ...bloqueContratoStyle, marginTop: "10px" }}>
                                <strong style={{ ...tituloContratoStyle, color: "#388E3C" }}>
                                  PDF final anterior
                                </strong>
                                <button
                                  type="button"
                                  onClick={() => window.open(emp.contrato_firmado_url, "_blank", "noopener")}
                                  style={{
                                    background: "white",
                                    border: "1px solid #6BAA45",
                                    color: "#388E3C",
                                    borderRadius: "6px",
                                    padding: "6px 8px",
                                    cursor: "pointer",
                                    fontWeight: "700",
                                  }}
                                >
                                  Abrir PDF anterior
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              )}
            </div>
            <div className="admin-mobile-cards">
              {cargando ? (
                <div className="admin-mobile-card">Cargando documentos...</div>
              ) : empleados.length === 0 ? (
                <div className="admin-mobile-card">No hay empleados registrados.</div>
              ) : empleadosFiltrados.length === 0 ? (
                <div className="admin-mobile-card" role="status">
                  No hay empleados que coincidan con la búsqueda.
                </div>
              ) : empleadosPaginados.map((emp) => (
                <article className="admin-mobile-card admin-mobile-documents-card" key={`documentos-${emp.id || emp.cedula}`}>
                  <h2>{formatearNombrePropio(emp.nombre_completo) || "Sin nombre"}</h2>
                  <p><strong>Cédula:</strong> {emp.cedula || "—"}</p>
                  {[
                    ["Cédula frente", emp.cedula_frente_url, `cedula_frente_${emp.cedula}`],
                    ["Cédula respaldo", emp.cedula_respaldo_url, `cedula_respaldo_${emp.cedula}`],
                    ["Certificado bancario", emp.certificado_bancario_url, `certificado_bancario_${emp.cedula}`],
                    ["Certificado EPS", emp.certificado_eps_url, `certificado_eps_${emp.cedula}`],
                    ["Certificado pensión", emp.certificado_pension_url, `certificado_pension_${emp.cedula}`],
                    ["Fotografía", emp.fotografia_url, `fotografia_${emp.cedula}`],
                  ].map(([label, url, nombre]) => (
                    <div className="admin-mobile-document" key={label}>
                      <strong>{label}</strong>
                      {url ? (
                        <div className="admin-mobile-actions">
                          <button
                            type="button"
                            className="admin-mobile-button admin-mobile-button-secondary"
                            onClick={() => window.open(url, "_blank", "noopener")}
                          >
                            VER
                          </button>
                          <button
                            type="button"
                            className="admin-mobile-button"
                            onClick={() => descargarArchivo(url, nombre)}
                          >
                            DESCARGAR
                          </button>
                        </div>
                      ) : <span>No cargado</span>}
                    </div>
                  ))}
                  <div className="admin-mobile-document">
                    <strong>Contrato</strong>
                    <span>
                      {emp.contrato_estado === "firmado"
                        ? "Contrato final publicado"
                        : emp.contrato_url
                          ? "Borrador pendiente de publicar"
                          : "Sin publicar"}
                    </span>
                    <div className="admin-mobile-actions">
                      {emp.contrato_url && (
                        <button
                          type="button"
                          className="admin-mobile-button admin-mobile-button-secondary"
                          onClick={() => window.open(emp.contrato_url, "_blank", "noopener")}
                        >
                          {emp.contrato_estado === "firmado" ? "ABRIR CONTRATO" : "ABRIR BORRADOR"}
                        </button>
                      )}
                      {emp.contrato_firmado_url && (
                        <button
                          type="button"
                          className="admin-mobile-button admin-mobile-button-secondary"
                          onClick={() => window.open(emp.contrato_firmado_url, "_blank", "noopener")}
                        >
                          ABRIR PDF ANTERIOR
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <Paginacion
              cantidad={empleadosFiltrados.length}
              pagina={paginaActual}
              cambiarPagina={cambiarPagina}
            />
          </div>
        )}

        {opcion === "documentos-crd" && (
          <section>
            <EncabezadoAdmin descripcion="Panel de administración · Documentos CRD" />

            <FiltroPorPersona
              busqueda={busqueda}
              cambiarBusqueda={setBusqueda}
              cantidad={empleadosFiltrados.length}
              etiqueta="empleados"
            />

            <div className="admin-crd-table" style={{ background: "#FFFFFF", borderRadius: "12px", boxShadow: "0 5px 20px rgba(0,0,0,0.08)", overflow: "auto" }}>
              {empleadosFiltrados.length === 0 ? (
                <div className="admin-empty-filter" role="status">
                  {empleados.length === 0
                    ? "No hay empleados registrados."
                    : "No hay empleados que coincidan con la búsqueda."}
                </div>
              ) : <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "1100px" }}>
                <thead>
                  <tr>
                    <th style={estiloEncabezadoDocumentos}>Empleado</th>
                    {documentosCRD.map((nombreDocumento) => (
                      <th key={nombreDocumento} style={estiloEncabezadoDocumentos}>{nombreDocumento}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {empleadosPaginados.map((empleado) => (
                    <tr key={empleado.id}>
                      <td style={estiloTd}>
                        <strong>{formatearNombrePropio(empleado.nombre_completo) || "Sin nombre"}</strong>
                        <br />
                        {empleado.cedula || "Sin cédula"}
                      </td>
                      {documentosCRD.map((nombreDocumento) => {
                        const clave = `${empleado.id}-${nombreDocumento}`;
                        const descargando = descargandoDocumento === clave;
                        return (
                          <td key={nombreDocumento} style={estiloTd}>
                            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            <button
                              type="button"
                              onClick={() => void verDocumentoCRD(empleado, nombreDocumento)}
                              disabled={Boolean(descargandoDocumento)}
                              style={{ background: "white", color: "#3187B5", border: "1px solid #3187B5", borderRadius: "6px", padding: "8px 10px", fontWeight: "700", cursor: descargando ? "wait" : "pointer", opacity: descargandoDocumento && !descargando ? 0.55 : 1 }}
                            >
                              VER
                            </button>
                            <button
                              type="button"
                              onClick={() => void descargarDocumentoCRD(empleado, nombreDocumento)}
                              disabled={Boolean(descargandoDocumento)}
                              style={{ background: "#6BAA45", color: "white", border: "none", borderRadius: "6px", padding: "8px 10px", fontWeight: "700", cursor: descargando ? "wait" : "pointer", opacity: descargandoDocumento && !descargando ? 0.55 : 1 }}
                            >
                              {descargando ? "GENERANDO..." : "DESCARGAR"}
                            </button>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>}
            </div>
            <div className="admin-mobile-cards">
              {empleadosFiltrados.length === 0 ? (
                <div className="admin-mobile-card" role="status">
                  {empleados.length === 0
                    ? "No hay empleados registrados."
                    : "No hay empleados que coincidan con la búsqueda."}
                </div>
              ) : empleadosPaginados.map((empleado) => (
                <article className="admin-mobile-card" key={`crd-${empleado.id}`}>
                  <h2>{formatearNombrePropio(empleado.nombre_completo) || "Sin nombre"}</h2>
                  <p><strong>Cédula:</strong> {empleado.cedula || "Sin cédula"}</p>
                  {documentosCRD.map((nombreDocumento) => {
                    const clave = `${empleado.id}-${nombreDocumento}`;
                    const descargando = descargandoDocumento === clave;
                    return (
                      <div className="admin-mobile-document" key={nombreDocumento}>
                        <strong>{nombreDocumento}</strong>
                        <div className="admin-mobile-actions">
                        <button
                          type="button"
                          className="admin-mobile-button admin-mobile-button-secondary"
                          onClick={() => void verDocumentoCRD(empleado, nombreDocumento)}
                          disabled={Boolean(descargandoDocumento)}
                        >
                          VER
                        </button>
                        <button
                          type="button"
                          className="admin-mobile-button"
                          onClick={() => void descargarDocumentoCRD(empleado, nombreDocumento)}
                          disabled={Boolean(descargandoDocumento)}
                        >
                          {descargando ? "GENERANDO..." : "DESCARGAR"}
                        </button>
                        </div>
                      </div>
                    );
                  })}
                </article>
              ))}
            </div>
            <Paginacion
              cantidad={empleadosFiltrados.length}
              pagina={paginaActual}
              cambiarPagina={cambiarPagina}
            />
          </section>
        )}

        {opcion === "observaciones" && (
          <section>
            <EncabezadoAdmin descripcion="Panel de administración · Observaciones de documentos" />
            <FiltroPorPersona
              busqueda={busqueda}
              cambiarBusqueda={setBusqueda}
              cantidad={empleadosConDocumentos.length}
              etiqueta="empleados con documentos"
            />
            {empleadosConDocumentos.length === 0 ? (
              <div className="admin-empty-filter" role="status">
                {empleados.length === 0
                  ? "No hay empleados registrados."
                  : "No se encontraron empleados para revisar."}
              </div>
            ) : (
              <div style={{ display: "grid", gap: "16px" }}>
                {empleadosConDocumentos.map((empleado) => (
                  <details
                    key={`observaciones-${empleado.id}`}
                    style={{ background: "#FFFFFF", borderRadius: "12px", boxShadow: "0 5px 20px rgba(0,0,0,0.08)", overflow: "hidden" }}
                  >
                    <summary style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap", padding: "16px 20px", cursor: "pointer", listStylePosition: "inside" }}>
                      <span>
                        <strong style={{ color: "#263238" }}>
                          {formatearNombrePropio(empleado.nombre_completo) || "Sin nombre"}
                        </strong>
                        <span style={{ display: "block", margin: "4px 0 0 20px", color: "#607D8B", fontSize: "13px" }}>
                          Cédula: {empleado.cedula || "Sin cédula"}
                        </span>
                      </span>
                      <span style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginLeft: "20px" }}>
                        <span style={{ padding: "4px 9px", borderRadius: "14px", background: "#EAF2F6", color: "#455A64", fontSize: "12px", fontWeight: 700 }}>
                          {DOCUMENTOS_EMPLEADO.filter(({ campoUrl }) => empleado[campoUrl]).length} documentos
                        </span>
                        {obtenerDocumentosPorCorregir(empleado.documentos_revision).length > 0 && (
                          <span style={{ padding: "4px 9px", borderRadius: "14px", background: "#FFF0D9", color: "#8A4B08", fontSize: "12px", fontWeight: 700 }}>
                            {obtenerDocumentosPorCorregir(empleado.documentos_revision).length} por corregir
                          </span>
                        )}
                      </span>
                    </summary>
                    <div style={{ padding: "0 20px 8px" }}>
                      <RevisionDocumentos
                        empleado={empleado}
                        onGuardar={guardarRevisionDocumento}
                      />
                    </div>
                  </details>
                ))}
              </div>
            )}
          </section>
        )}

        {opcion === "contratos" && (
          <section>
            <EncabezadoAdmin descripcion="Panel de administración · Contratos" />

            <FiltroPorPersona
              busqueda={busqueda}
              cambiarBusqueda={setBusqueda}
              cantidad={empleadosFiltrados.length}
              etiqueta="empleados"
            />

            <details style={{ background: "#FFFFFF", borderRadius: "12px", marginBottom: "20px", boxShadow: "0 5px 20px rgba(0,0,0,0.08)" }}>
              <summary style={{ padding: "16px 24px", color: "#455A64", fontWeight: "700", cursor: "pointer" }}>
                Opciones avanzadas: reemplazar un documento individual
              </summary>
              <form onSubmit={subirContratoManual} style={{ padding: "0 24px 24px" }}>
              <h2 style={{ margin: "0 0 18px", color: "#263238", fontSize: "18px" }}>Reemplazar contrato o anexo</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px", alignItems: "end" }}>
                <label style={estiloLabel}>
                  Persona
                  <select
                    value={empleadoContratoId}
                    onChange={(event) => setEmpleadoContratoId(event.target.value)}
                    required
                    style={{ ...estiloInput, display: "block", marginTop: "7px" }}
                  >
                    <option value="">Selecciona una persona</option>
                    {empleados.map((empleado) => (
                      <option key={empleado.id} value={empleado.id}>
                        {formatearNombrePropio(empleado.nombre_completo)} · {empleado.cedula}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={estiloLabel}>
                  Tipo de documento
                  <select
                    value={tipoDocumentoContrato}
                    onChange={(event) => setTipoDocumentoContrato(event.target.value)}
                    style={{ ...estiloInput, display: "block", marginTop: "7px" }}
                  >
                    <option value="contrato">Contrato</option>
                    {documentosCRD.filter((nombre) => nombre !== NOMBRE_DOCUMENTO_CONTRATO).map((nombre) => (
                      <option key={nombre} value={`anexo:${nombre}`}>Anexo CRD · {nombre}</option>
                    ))}
                  </select>
                </label>
                <label style={estiloLabel}>
                  PDF o Word del contrato (Word se convierte a PDF; máximo 10 MB)
                  <input
                    key={archivoContratoManual?.name || "contrato-vacio"}
                    type="file"
                    accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={(event) => setArchivoContratoManual(event.target.files?.[0] || null)}
                    required
                    style={{ ...estiloInput, display: "block", marginTop: "7px", padding: "9px 10px" }}
                  />
                </label>
                <button
                  type="submit"
                  disabled={subiendoContratoManual || cargando}
                  style={{ height: "45px", padding: "0 18px", background: "#3187B5", color: "white", border: "none", borderRadius: "8px", fontWeight: "700", cursor: subiendoContratoManual ? "wait" : "pointer", opacity: subiendoContratoManual ? 0.7 : 1 }}
                >
                  {subiendoContratoManual ? "CONVIRTIENDO Y PUBLICANDO..." : "PUBLICAR CONTRATO COMO PDF"}
                </button>
              </div>
              </form>
            </details>
            {mensajeContratoManual && <p role="status" style={{ margin: "0 0 20px", color: /publicado|publicaron/.test(mensajeContratoManual) ? "#388E3C" : "#C62828" }}>{mensajeContratoManual}</p>}

            {empleadosFiltrados.length === 0 ? (
              <div className="admin-empty-filter" role="status">
                {empleados.length === 0
                  ? "No hay empleados registrados."
                  : "No hay empleados que coincidan con la búsqueda."}
              </div>
            ) : <div className="admin-contracts-table" style={{ background: "#FFFFFF", borderRadius: "12px", boxShadow: "0 5px 20px rgba(0,0,0,0.08)", overflow: "auto" }}>
              <table className="admin-contract-table">
                <colgroup>
                  <col className="admin-contract-column-person" />
                  <col className="admin-contract-column-actions" />
                  <col className="admin-contract-column-id" />
                  <col className="admin-contract-column-status" />
                  <col className="admin-contract-column-files" />
                </colgroup>
                <thead>
                  <tr>
                    <th style={estiloEncabezadoDocumentos}>PERSONA</th>
                    <th style={estiloEncabezadoDocumentos}>ACCIONES</th>
                    <th style={estiloEncabezadoDocumentos}>CÉDULA</th>
                    <th style={estiloEncabezadoDocumentos}>ESTADO</th>
                    <th style={estiloEncabezadoDocumentos}>ARCHIVO</th>
                  </tr>
                </thead>
                <tbody>
                  {empleadosPaginados.map((empleado) => (
                    <tr key={empleado.id}>
                      <td className="admin-contract-cell" style={estiloTd}>{formatearNombrePropio(empleado.nombre_completo)}</td>
                      <td className="admin-contract-cell" style={estiloTd}>
                        <div className="admin-contract-actions">
                          <div className="admin-contract-publish-actions">
                          <button
                            type="button"
                            className="admin-contract-button admin-contract-view-button"
                            aria-label="Ver borrador del contrato"
                            title="Ver borrador del contrato"
                            disabled={subiendoContratoId === empleado.id}
                            onClick={() => previsualizarContrato(empleado)}
                            style={{ background: "white", border: "1px solid #3187B5", color: "#3187B5", borderRadius: "6px", padding: "7px 10px", cursor: subiendoContratoId === empleado.id ? "wait" : "pointer", fontWeight: "700", opacity: subiendoContratoId === empleado.id ? 0.7 : 1 }}
                          >
                            {subiendoContratoId === empleado.id ? "..." : "Ver"}
                          </button>
                          <button
                            type="button"
                            className="admin-contract-button"
                            title="Publicar solo el contrato"
                            disabled={publicandoContrato || subiendoContratoManual}
                            onClick={() => void publicarDocumentosContrato(empleado, "contrato")}
                            style={{ background: "#6BAA45", border: "none", color: "white", borderRadius: "6px", padding: "7px 10px", cursor: publicandoContrato ? "wait" : "pointer", fontWeight: "700", opacity: publicandoContrato ? 0.7 : 1 }}
                          >
                            Contrato
                          </button>
                          <button
                            type="button"
                            className="admin-contract-button"
                            title="Publicar solo los anexos"
                            disabled={publicandoContrato || subiendoContratoManual}
                            onClick={() => void publicarDocumentosContrato(empleado, "anexos")}
                            style={{ background: "#3187B5", border: "none", color: "white", borderRadius: "6px", padding: "7px 10px", cursor: publicandoContrato ? "wait" : "pointer", fontWeight: "700", opacity: publicandoContrato ? 0.7 : 1 }}
                          >
                            Anexos
                          </button>
                          <button
                            type="button"
                            className="admin-contract-button"
                            title="Publicar el contrato y los anexos"
                            disabled={publicandoContrato || subiendoContratoManual}
                            onClick={() => void publicarDocumentosContrato(empleado, "ambos")}
                            style={{ background: "#3B7A57", border: "none", color: "white", borderRadius: "6px", padding: "7px 10px", cursor: publicandoContrato ? "wait" : "pointer", fontWeight: "700", opacity: publicandoContrato ? 0.7 : 1 }}
                          >
                            Ambos
                          </button>
                          </div>
                          {(empleado.contrato_url
                            || empleado.contrato_firmado_url
                            || empleado.contrato_documentos?.length
                            || empleado.contrato_documentos_firmados?.length) && (
                            <button
                              type="button"
                              className="admin-contract-button"
                              aria-label="Eliminar contrato"
                              title="Eliminar contrato"
                              onClick={() => eliminarContrato(empleado)}
                              disabled={eliminandoContratoId === String(empleado.id)}
                              style={{ background: "white", border: "1px solid #E53935", color: "#C62828", borderRadius: "6px", padding: "7px 10px", cursor: eliminandoContratoId === String(empleado.id) ? "wait" : "pointer", fontWeight: "700" }}
                            >
                              {eliminandoContratoId === String(empleado.id) ? "Borrando..." : "Borrar"}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="admin-contract-cell" style={estiloTd}>{empleado.cedula}</td>
                      <td className="admin-contract-cell" style={estiloTd}>{empleado.contrato_estado === "firmado" ? "Contrato final publicado" : empleado.contrato_url ? "Borrador pendiente de publicar" : "Sin publicar"}</td>
                      <td className="admin-contract-cell" style={estiloTd}>
                        {Array.isArray(empleado.contrato_documentos) && empleado.contrato_documentos.length
                          ? (
                            <div className="admin-contract-files">
                              {empleado.contrato_documentos.map((documento) => (
                                <a key={documento.url} href={documento.url} target="_blank" rel="noreferrer" title={documento.name || documento.tipo}>
                                  {documento.name || documento.tipo}
                                </a>
                              ))}
                            </div>
                          )
                          : <span className="admin-contract-filename" title={empleado.contrato_nombre || ""}>{empleado.contrato_nombre || "-"}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>}
            <div className="admin-mobile-cards">
              {empleadosFiltrados.length === 0 ? (
                <div className="admin-mobile-card" role="status">
                  {empleados.length === 0
                    ? "No hay empleados registrados."
                    : "No hay empleados que coincidan con la búsqueda."}
                </div>
              ) : empleadosPaginados.map((empleado) => (
                <article className="admin-mobile-card admin-mobile-contract-card" key={`contrato-${empleado.id}`}>
                  <h2>{formatearNombrePropio(empleado.nombre_completo) || "Sin nombre"}</h2>
                  <div className="admin-mobile-actions admin-mobile-contract-actions">
                    <div className="admin-mobile-contract-publish-actions">
                    <button
                      type="button"
                      className="admin-mobile-button admin-mobile-button-secondary admin-mobile-contract-button admin-mobile-contract-view-button"
                      title="Ver borrador del contrato"
                      disabled={subiendoContratoId === empleado.id}
                      onClick={() => void previsualizarContrato(empleado)}
                    >
                      {subiendoContratoId === empleado.id ? "GENERANDO..." : "VER"}
                    </button>
                    <button
                      type="button"
                      className="admin-mobile-button admin-mobile-contract-button"
                      title="Publicar solo el contrato"
                      disabled={publicandoContrato || subiendoContratoManual}
                      onClick={() => void publicarDocumentosContrato(empleado, "contrato")}
                    >
                      CONTRATO
                    </button>
                    <button
                      type="button"
                      className="admin-mobile-button admin-mobile-contract-button"
                      title="Publicar solo los anexos"
                      disabled={publicandoContrato || subiendoContratoManual}
                      onClick={() => void publicarDocumentosContrato(empleado, "anexos")}
                    >
                      ANEXOS
                    </button>
                    <button
                      type="button"
                      className="admin-mobile-button admin-mobile-contract-button"
                      title="Publicar el contrato y los anexos"
                      disabled={publicandoContrato || subiendoContratoManual}
                      onClick={() => void publicarDocumentosContrato(empleado, "ambos")}
                    >
                      AMBOS
                    </button>
                    </div>
                    {(empleado.contrato_url
                      || empleado.contrato_firmado_url
                      || empleado.contrato_documentos?.length
                      || empleado.contrato_documentos_firmados?.length) && (
                      <button
                        type="button"
                        className="admin-mobile-button admin-mobile-button-danger admin-mobile-contract-button"
                        title="Eliminar contrato"
                        onClick={() => eliminarContrato(empleado)}
                        disabled={eliminandoContratoId === String(empleado.id)}
                      >
                        {eliminandoContratoId === String(empleado.id) ? "BORRANDO..." : "ELIMINAR"}
                      </button>
                    )}
                  </div>
                  <p><strong>Cédula:</strong> {empleado.cedula || "—"}</p>
                  <p>
                    <strong>Estado:</strong>{" "}
                    {empleado.contrato_estado === "firmado"
                      ? "Contrato final publicado"
                      : empleado.contrato_url
                        ? "Borrador pendiente de publicar"
                        : "Sin publicar"}
                  </p>
                  <div className="admin-mobile-document">
                    <strong>Documentos</strong>
                    {Array.isArray(empleado.contrato_documentos) && empleado.contrato_documentos.length
                      ? (
                        <div className="admin-contract-files">
                          {empleado.contrato_documentos.map((documento) => (
                            <a key={documento.url} href={documento.url} target="_blank" rel="noreferrer" title={documento.name || documento.tipo}>
                              {documento.name || documento.tipo}
                            </a>
                          ))}
                        </div>
                      )
                      : <span>{empleado.contrato_nombre || "Sin archivo"}</span>}
                  </div>
                </article>
              ))}
            </div>
            <Paginacion
              cantidad={empleadosFiltrados.length}
              pagina={paginaActual}
              cambiarPagina={cambiarPagina}
            />
          </section>
        )}

        {crdVista && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Vista previa del documento"
            style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(20, 35, 45, 0.72)", display: "flex", justifyContent: "center", alignItems: "center", padding: "20px" }}
          >
            <section style={{ width: "min(1100px, 100%)", height: "min(92vh, 900px)", background: "#F5F7F8", borderRadius: "12px", display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <header style={{ padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", background: "white", borderBottom: "1px solid #D9E1E5" }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: "20px", color: "#263238" }}>{crdVista.nombreDocumento.replace(/\.docx$/i, "")}</h2>
                  <p style={{ margin: "5px 0 0", color: "#607D8B" }}>{formatearNombrePropio(crdVista.empleado.nombre_completo)} · {crdVista.empleado.cedula}</p>
                </div>
                <button type="button" onClick={() => setCrdVista(null)} aria-label="Cerrar vista previa" style={{ border: 0, background: "transparent", fontSize: "26px", cursor: "pointer", color: "#455A64" }}>×</button>
              </header>
              {errorCrdVista && <p role="alert" style={{ margin: "12px 20px", color: "#C62828" }}>{errorCrdVista}</p>}
              <div ref={crdVistaStylesRef} aria-hidden="true" />
              <div ref={crdVistaRef} style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "20px" }} />
              <footer style={{ padding: "14px 20px", display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: "10px", background: "white", borderTop: "1px solid #D9E1E5" }}>
                <button type="button" onClick={() => void descargarDocumentoCRD(crdVista.empleado, crdVista.nombreDocumento)} style={{ padding: "10px 14px", border: 0, borderRadius: "7px", background: "#6BAA45", color: "white", fontWeight: "700", cursor: "pointer" }}>Descargar</button>
                <button type="button" onClick={() => setCrdVista(null)} style={{ padding: "10px 14px", border: "1px solid #90A4AE", borderRadius: "7px", background: "white", color: "#455A64", fontWeight: "700", cursor: "pointer" }}>Cerrar</button>
              </footer>
            </section>
          </div>
        )}

        {contratoPrevisualizar && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="vista-previa-contrato-titulo"
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 1000,
              background: "rgba(20, 35, 45, 0.72)",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              padding: "20px",
            }}
          >
            <section style={{ width: "min(1100px, 100%)", height: "min(92vh, 900px)", background: "#F5F7F8", borderRadius: "12px", display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <header style={{ padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", background: "white", borderBottom: "1px solid #D9E1E5" }}>
                <div>
                  <h2 id="vista-previa-contrato-titulo" style={{ margin: 0, fontSize: "20px", color: "#263238" }}>Vista previa del contrato</h2>
                  <p style={{ margin: "5px 0 0", color: "#607D8B" }}>{formatearNombrePropio(contratoPrevisualizar.nombreEmpleado)} · Se publicará como PDF para que el empleado lo vea en su cuenta.</p>
                </div>
                <button type="button" onClick={cerrarVistaPreviaContrato} aria-label="Cerrar vista previa" style={{ border: 0, background: "transparent", fontSize: "26px", cursor: "pointer", color: "#455A64" }}>×</button>
              </header>

              {errorVistaPrevia && <p role="alert" style={{ margin: "12px 20px", color: "#C62828" }}>{errorVistaPrevia}</p>}
              {cargandoVistaPrevia && <p role="status" style={{ margin: "12px 20px", color: "#607D8B" }}>Preparando vista previa del contrato...</p>}
              {pdfVistaPreviaUrl && (
                <iframe
                  title="Vista previa del contrato en PDF"
                  src={pdfVistaPreviaUrl}
                  style={{ flex: 1, minHeight: 0, width: "100%", border: 0, background: "#fff" }}
                />
              )}
              {!pdfVistaPreviaUrl && <div style={{ flex: 1 }} />}

              <footer style={{ padding: "14px 20px", display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: "10px", background: "white", borderTop: "1px solid #D9E1E5" }}>
                <button type="button" onClick={descargarContratoPrevisualizado} disabled={!contratoPrevisualizar.archivo} style={{ padding: "10px 14px", border: "1px solid #607D8B", borderRadius: "7px", background: "white", color: "#455A64", fontWeight: "700", cursor: contratoPrevisualizar.archivo ? "pointer" : "not-allowed", opacity: contratoPrevisualizar.archivo ? 1 : 0.55 }}>Descargar Word</button>
                <button type="button" onClick={() => void publicarContratoPrevisualizado()} disabled={!pdfVistaPreviaUrl || cargandoVistaPrevia || publicandoContrato} style={{ padding: "10px 14px", border: 0, borderRadius: "7px", background: publicandoContrato ? "#8295A0" : "#388E3C", color: "white", fontWeight: "700", cursor: publicandoContrato ? "wait" : "pointer", opacity: publicandoContrato ? 0.7 : 1 }}>{publicandoContrato ? "PUBLICANDO..." : "PUBLICAR PDF PARA EL EMPLEADO"}</button>
                <button type="button" onClick={cerrarVistaPreviaContrato} style={{ padding: "10px 14px", border: "1px solid #90A4AE", borderRadius: "7px", background: "white", color: "#455A64", fontWeight: "700", cursor: "pointer" }}>Cerrar vista previa</button>
              </footer>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

// COMPONENTE CELDA ARCHIVO
// =========================================================

function CeldaArchivo({
  url,
  nombre,
  descargarArchivo,
  compacto = false,
}) {
  return (
    <td style={compacto ? estiloTdDocumentos : estiloTd}>
      {url ? (
        <div
          className={compacto ? "admin-document-file-actions" : undefined}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "7px",
            alignItems: "stretch",
          }}
        >
              <button
            type="button"
            className={compacto ? "admin-document-action-button" : undefined}
            onClick={() => window.open(url, '_blank', 'noopener')}
            style={{
              background: "white",
              border: "1px solid #3187B5",
              color: "#3187B5",
              fontWeight: "700",
                    padding: "7px 5px",
                  width: "100%",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            Ver
          </button>

          <button
            type="button"
            className={compacto ? "admin-document-action-button" : undefined}
            onClick={() =>
              descargarArchivo(
                url,
                nombre
              )
            }
            style={{
              background:
                "#6BAA45",
              color: "white",
              border: "none",
              borderRadius: "6px",
              padding: "7px 5px",
              width: "100%",
              cursor:
                "pointer",
              fontWeight:
                "700",
            }}
          >
            Descargar
          </button>
        </div>
      ) : (
        "No cargado"
      )}
    </td>
  );
}

// =========================================================
// ESTILOS
// =========================================================

const estiloTh = {
  padding: "15px 12px",
  textAlign: "left",
  fontSize: "13px",
  whiteSpace: "nowrap",
};

const estiloTd = {
  padding: "13px 12px",
  borderBottom:
    "1px solid #E5E9EC",
  fontSize: "13px",
  color: "#263238",
  whiteSpace: "nowrap",
};

const fondoEncabezadoEmpleados = "linear-gradient(135deg, #8BC34A, #3187B5)";

const estiloEncabezadoEmpleados = {
  ...estiloTh,
  position: "sticky",
  top: 0,
  zIndex: 2,
  background: fondoEncabezadoEmpleados,
  color: "white",
};

const estiloEncabezadoFijoEmpleados = (left, width, ultimaColumnaFija = false) => ({
  ...estiloEncabezadoEmpleados,
  left,
  width,
  minWidth: width,
  zIndex: 3,
  ...(ultimaColumnaFija ? { boxShadow: "4px 0 6px rgba(38, 50, 56, 0.14)" } : {}),
});

const estiloColumnaFijaEmpleados = (left, width, ultimaColumnaFija = false) => ({
  ...estiloTd,
  position: "sticky",
  left,
  width,
  minWidth: width,
  zIndex: 1,
  background: "white",
  ...(ultimaColumnaFija ? { boxShadow: "4px 0 6px rgba(38, 50, 56, 0.14)" } : {}),
});

const estiloAccionFijaEncabezado = {
  ...estiloEncabezadoFijoEmpleados(590, 230),
  zIndex: 4,
};

const estiloAccionFijaColumna = {
  ...estiloColumnaFijaEmpleados(590, 230),
  zIndex: 2,
};

const estiloThDocumentos = {
  ...estiloTh,
  textAlign: "center",
  verticalAlign: "middle",
  padding: "13px 8px",
  whiteSpace: "normal",
  height: "56px",
};

const fondoEncabezadoDocumentos = "linear-gradient(135deg, #8BC34A, #3187B5)";

const estiloEncabezadoDocumentos = {
  ...estiloThDocumentos,
  position: "sticky",
  top: 0,
  zIndex: 2,
  background: fondoEncabezadoDocumentos,
  color: "white",
};

const estiloEncabezadoFijoDocumentos = (left, width, ultimaColumnaFija = false) => ({
  ...estiloEncabezadoDocumentos,
  left,
  width,
  minWidth: width,
  zIndex: 3,
  ...(ultimaColumnaFija ? { boxShadow: "4px 0 6px rgba(38, 50, 56, 0.14)" } : {}),
});

const estiloTdDocumentos = {
  ...estiloTd,
  textAlign: "center",
  verticalAlign: "middle",
  padding: "12px 8px",
  whiteSpace: "normal",
  height: "118px",
};

const estiloColumnaFijaDocumentos = (left, width, ultimaColumnaFija = false) => ({
  ...estiloTdDocumentos,
  position: "sticky",
  left,
  width,
  minWidth: width,
  zIndex: 1,
  background: "white",
  ...(ultimaColumnaFija ? { boxShadow: "4px 0 6px rgba(38, 50, 56, 0.14)" } : {}),
});

const bloqueContratoStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "7px",
  alignItems: "stretch",
};

const tituloContratoStyle = {
  color: "#455A64",
  fontSize: "12px",
  lineHeight: "1.25",
};

const estiloLabel = {
  display: "block",
  marginBottom: "7px",
  fontSize: "13px",
  fontWeight: "700",
  color: "#455A64",
};

const estiloInput = {
  width: "100%",
  height: "45px",
  padding: "0 15px",
  border:
    "1px solid #D5DDE2",
  borderRadius: "8px",
  fontSize: "14px",
  boxSizing: "border-box",
  outline: "none",
};

function RevisionDocumentos({ empleado, onGuardar }) {
  const [notas, setNotas] = useState(() => Object.fromEntries(
    DOCUMENTOS_EMPLEADO.map(({ clave }) => [
      clave,
      empleado.documentos_revision?.[clave]?.observacion || "",
    ])
  ));
  const [guardandoClave, setGuardandoClave] = useState("");
  const [error, setError] = useState("");
  const clavesPendientes = new Set(
    obtenerDocumentosPorCorregir(empleado.documentos_revision).map(({ clave }) => clave)
  );
  const documentos = DOCUMENTOS_EMPLEADO
    .filter(({ clave, campoUrl }) => empleado[campoUrl] || clave === "firma")
    .sort((documentoA, documentoB) => (
      Number(clavesPendientes.has(documentoB.clave))
      - Number(clavesPendientes.has(documentoA.clave))
    ));

  const solicitarCorreccion = async (clave) => {
    setGuardandoClave(clave);
    setError("");
    try {
      await onGuardar(empleado, clave, notas[clave]);
    } catch (errorGuardar) {
      console.error("Error guardando la observación del documento:", errorGuardar);
      setError(errorGuardar?.message || "No se pudo guardar la observación.");
    } finally {
      setGuardandoClave("");
    }
  };

  return (
    <section style={{ margin: "0 0 20px", padding: "16px", background: "#F5F8FA", border: "1px solid #DDE7EC", borderRadius: "10px" }}>
      <h3 style={{ margin: "0 0 10px", color: "#263238", fontSize: "16px" }}>Revisión de documentos</h3>
      {documentos.length === 0 ? (
        <p style={{ margin: 0, color: "#607D8B" }}>Este registro no tiene documentos cargados.</p>
      ) : (
        <div style={{ display: "grid", gap: "12px" }}>
          {documentos.map(({ clave, campoUrl, etiqueta }) => (
            <details key={clave} style={{ background: "#FFFFFF", border: "1px solid #DDE7EC", borderRadius: "8px", overflow: "hidden" }}>
              <summary style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap", padding: "12px", cursor: "pointer", color: "#263238", fontWeight: 700, listStylePosition: "inside" }}>
                <span>{etiqueta}</span>
                <span style={{
                  padding: "4px 9px",
                  borderRadius: "14px",
                  background: clavesPendientes.has(clave) ? "#FFF0D9" : "#EAF2F6",
                  color: clavesPendientes.has(clave) ? "#8A4B08" : "#455A64",
                  fontSize: "12px",
                }}>
                  {clavesPendientes.has(clave) ? "Observación enviada" : "Sin observaciones"}
                </span>
              </summary>
              <div style={{ padding: "0 12px 12px" }}>
                {empleado[campoUrl] ? (
                  <a href={empleado[campoUrl]} target="_blank" rel="noreferrer" style={{ color: "#3187B5" }}>
                    Ver documento
                  </a>
                ) : (
                  <p role="status" style={{ margin: 0, color: "#8A4B08" }}>
                    No hay firma cargada. Puedes solicitar que la suba.
                  </p>
                )}
                <label style={{ display: "block", marginTop: "8px", fontSize: "13px", color: "#455A64", fontWeight: 700 }}>
                  Nota visible para el usuario
                  <textarea
                    value={notas[clave]}
                    onChange={(event) => setNotas((actuales) => ({
                      ...actuales,
                      [clave]: event.target.value,
                    }))}
                    rows={2}
                    placeholder="Indica qué debe corregir."
                    style={{ display: "block", width: "100%", marginTop: "5px", padding: "9px", boxSizing: "border-box", border: "1px solid #D5DDE2", borderRadius: "6px", font: "inherit", resize: "vertical" }}
                  />
                </label>
                <button
                  type="button"
                  disabled={guardandoClave === clave}
                  onClick={() => void solicitarCorreccion(clave)}
                  style={{ marginTop: "8px", padding: "8px 12px", border: 0, borderRadius: "6px", background: clavesPendientes.has(clave) ? "#EF8B22" : "#3187B5", color: "#FFFFFF", fontWeight: 700, cursor: guardandoClave === clave ? "wait" : "pointer" }}
                >
                  {guardandoClave === clave
                    ? "GUARDANDO..."
                    : clavesPendientes.has(clave) ? "ACTUALIZAR OBSERVACIÓN" : "SOLICITAR CORRECCIÓN"}
                </button>
              </div>
            </details>
          ))}
        </div>
      )}
      {error && <p role="alert" style={{ margin: "10px 0 0", color: "#B71C1C" }}>{error}</p>}
    </section>
  );
}

export default PanelAdmin;
