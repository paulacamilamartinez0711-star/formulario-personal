import { useEffect, useState } from "react";
import Formulario from "./Formulario.jsx";
import PanelAdmin from "./PanelAdmin.jsx";
import { supabase } from "../supabase";
import { CAMPOS_ESTADO_FORMULARIO, isFormularioEmpleadoCompleto } from "../../shared/formularioEstado.js";
import { obtenerDocumentosPorCorregir } from "../../shared/documentReview.js";
import { descargarDocumentoContrato, verDocumentoContrato } from "../documentosContrato.js";
import logoRD from "../assets/Logo RD Soluciones.jpg.jpeg";

const seccionesFormulario = [
  {
    titulo: "Identificación y datos personales",
    campos: [
      ["cedula", "Número de cédula"],
      ["nombre_completo", "Nombres y apellidos"],
      ["correo", "Correo electrónico"],
      ["cargo", "Cargo"],
      ["proyecto", "Proyecto"],
      ["lugar_expedicion_departamento", "Departamento de expedición"],
      ["lugar_expedicion_municipio", "Municipio de expedición"],
      ["fecha_nacimiento", "Fecha de nacimiento"],
      ["lugar_nacimiento_departamento", "Departamento de nacimiento"],
      ["lugar_nacimiento_municipio", "Municipio de nacimiento"],
    ],
  },
  {
    titulo: "Contacto y residencia",
    campos: [
      ["celular", "Celular"],
      ["direccion", "Dirección"],
      ["ciudad_departamento", "Departamento de residencia"],
      ["ciudad_municipio", "Municipio de residencia"],
      ["persona_contacto", "Persona de contacto"],
      ["celular_contacto", "Celular de contacto"],
      ["parentesco", "Parentesco"],
    ],
  },
  {
    titulo: "Información laboral y bancaria",
    campos: [
      ["salario_basico", "Salario básico"],
      ["auxilio_1", "Auxilio de alimentación"],
      ["auxilio_2", "Auxilio de vivienda"],
      ["bono_productividad", "Bono de productividad"],
      ["cuenta_bancaria", "Número de cuenta bancaria"],
      ["entidad_financiera", "Entidad financiera"],
      ["fecha_inicio_contrato", "Fecha de inicio del contrato"],
      ["objeto_contrato", "Objeto del contrato"],
    ],
  },
  {
    titulo: "Salud y tallas",
    campos: [
      ["estado_civil", "Estado civil"],
      ["tipo_sangre", "Tipo de sangre"],
      ["eps", "EPS"],
      ["eps_otra", "Otra EPS"],
      ["fondo_pension", "Fondo de pensiones"],
      ["fondo_pension_otra", "Otro fondo de pensiones"],
      ["talla_botas", "Talla de botas"],
      ["talla_camisa", "Talla de camisa"],
      ["talla_pantalon", "Talla de pantalón"],
    ],
  },
];

const documentosFormulario = [
  ["cedula_frente_url", "Cédula - frente"],
  ["cedula_respaldo_url", "Cédula - respaldo"],
  ["certificado_bancario_url", "Certificado bancario"],
  ["certificado_eps_url", "Certificado de EPS"],
  ["certificado_pension_url", "Certificado de pensiones"],
  ["fotografia_url", "Fotografía"],
  ["firma_url", "Firma manuscrita"],
];

const camposRegistroEmpleado = [
  ...seccionesFormulario.flatMap(({ campos }) => campos.map(([campo]) => campo)),
  ...documentosFormulario.map(([campo]) => campo),
];

const puntajeRegistroEmpleado = (registro) =>
  camposRegistroEmpleado.reduce(
    (total, campo) => total + (String(registro[campo] ?? "").trim() ? 1 : 0),
    0
  );

function ContratoEmpleado() {
  const [contrato, setContrato] = useState(null);
  const [cargandoContrato, setCargandoContrato] = useState(true);
  const [aceptandoDocumentos, setAceptandoDocumentos] = useState(false);
  const [aceptaTodos, setAceptaTodos] = useState(false);
  const apiBase = import.meta.env.VITE_API_URL || "";

  useEffect(() => {
    let activo = true;
    let temporizador;

    const cargarContrato = async () => {
      const cedula = localStorage.getItem("usuarioCedula");
      if (!cedula) {
        if (activo) setCargandoContrato(false);
        return;
      }

      const { data, error } = await supabase
        .from("empleados")
        .select("*")
        .eq("cedula", cedula)
        .limit(20);

      if (error) {
        console.error("Error consultando contrato:", error);
      }

      if (!activo) return;

      const registro = [...(data || [])].sort((a, b) => {
        const pdfFinalA = a.contrato_documentos_firmados?.length
          ? a.contrato_documentos_firmados[0]?.url
          : a.contrato_documentos?.length ? a.contrato_documentos[0]?.url : a.contrato_url || a.contrato_firmado_url;
        const pdfFinalB = b.contrato_documentos_firmados?.length
          ? b.contrato_documentos_firmados[0]?.url
          : b.contrato_documentos?.length ? b.contrato_documentos[0]?.url : b.contrato_url || b.contrato_firmado_url;
        const diferenciaContrato = Number(Boolean(pdfFinalB)) - Number(Boolean(pdfFinalA));
        return diferenciaContrato || puntajeRegistroEmpleado(b) - puntajeRegistroEmpleado(a);
      })[0] || null;

      setContrato(registro);
      setCargandoContrato(false);

      const tieneContratoFinal = Boolean(
        registro?.contrato_documentos?.length
        || registro?.contrato_documentos_firmados?.length
        || registro?.contrato_url
        || registro?.contrato_firmado_url
      );
      if (!tieneContratoFinal) {
        temporizador = window.setTimeout(cargarContrato, 10000);
      }
    };

    void cargarContrato();

    return () => {
      activo = false;
      window.clearTimeout(temporizador);
    };
  }, []);

  const documentos = contrato?.contrato_aceptado && contrato?.contrato_documentos_firmados?.length
    ? contrato.contrato_documentos_firmados
    : Array.isArray(contrato?.contrato_documentos) && contrato.contrato_documentos.length
      ? contrato.contrato_documentos
      : contrato?.contrato_url
        ? [{ tipo: "contrato", name: contrato.contrato_nombre, url: contrato.contrato_url }]
        : [];
  const aceptarTodosLosDocumentos = async () => {
    if (!contrato || !documentos.length || !aceptaTodos) return;
    setAceptandoDocumentos(true);
    try {
      const fileIds = documentos.map((documento) => {
        try {
          const url = new URL(documento.url);
          return url.searchParams.get("id") || url.pathname.match(/\/file\/d\/([^/]+)/)?.[1];
        } catch {
          return null;
        }
      }).filter(Boolean);
      const endpoint = apiBase
        ? `${apiBase}/api/contratos/aceptar`
        : (import.meta.env.DEV ? "/api/contratos/aceptar" : "/api/archivos?accion=aceptar-contratos");
      const respuesta = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cedula: contrato.cedula, fileIds }),
      });
      const resultado = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok) throw new Error(resultado.error || "No se pudieron firmar los documentos.");
      setContrato((actual) => ({
        ...actual,
        contrato_aceptado: true,
        contrato_estado: "firmado",
        contrato_documentos_firmados: resultado.documents,
        contrato_firmado_url: resultado.documents?.[0]?.url,
      }));
      setAceptaTodos(false);
    } catch (error) {
      alert(error?.message || "No se pudieron aceptar los documentos.");
    } finally {
      setAceptandoDocumentos(false);
    }
  };

  return (
    <main style={{ maxWidth: "1100px", margin: "25px auto", padding: "0 16px" }}>
      {cargandoContrato && (
        <p style={{ color: "#607D8B" }}>Cargando tus datos guardados...</p>
      )}

      {!cargandoContrato && !contrato && (
        <section style={{ padding: "22px", background: "#FFFFFF", border: "1px solid #DDE7EC", borderRadius: "8px" }}>
          <h2 style={{ margin: "0 0 8px", color: "#263238", fontSize: "20px" }}>No se pudieron cargar tus datos</h2>
          <p style={{ margin: 0, color: "#607D8B" }}>Cierra sesión e ingresa nuevamente. Si el problema continúa, contacta a administración.</p>
        </section>
      )}

      {contrato && (
        <>
          <section style={{ marginBottom: "18px", padding: "22px", background: "#FFFFFF", border: "1px solid #DDE7EC", borderRadius: "8px" }}>
            <h2 style={{ margin: "0 0 6px", color: "#263238", fontSize: "20px" }}>Formulario diligenciado</h2>
            <p style={{ margin: "0 0 18px", color: "#607D8B" }}>Estos son los datos guardados. El formulario ya fue enviado y no se puede diligenciar de nuevo.</p>

            {seccionesFormulario.map((seccion) => (
              <section key={seccion.titulo} style={{ padding: "12px 0", borderTop: "1px solid #E5E9EC" }}>
                <h3 style={{ margin: "0 0 10px", color: "#3187B5", fontSize: "16px" }}>{seccion.titulo}</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", columnGap: "20px" }}>
                  {seccion.campos.map(([campo, etiqueta]) => {
                    const dato = contrato[campo];
                    const datoTexto = campo.startsWith("fecha_") && dato
                      ? String(dato).slice(0, 10).split("-").reverse().join("/")
                      : String(dato ?? "").trim() || "Pendiente";

                    return (
                      <div key={campo} style={{ padding: "8px 0", borderBottom: "1px solid #EEF1F3" }}>
                        <div style={{ color: "#607D8B", fontSize: "12px" }}>{etiqueta}</div>
                        <div style={{ color: "#263238", fontSize: "14px", overflowWrap: "anywhere" }}>{datoTexto}</div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}

            <section style={{ padding: "12px 0", borderTop: "1px solid #E5E9EC" }}>
              <h3 style={{ margin: "0 0 10px", color: "#3187B5", fontSize: "16px" }}>Documentos cargados</h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 18px" }}>
                {documentosFormulario.map(([campo, etiqueta]) => (
                  contrato[campo] ? (
                    <a key={campo} href={contrato[campo]} target="_blank" rel="noreferrer" style={{ color: "#3187B5" }}>
                      Ver {etiqueta.toLowerCase()}
                    </a>
                  ) : (
                    <span key={campo} style={{ color: "#78909C", fontSize: "14px" }}>{etiqueta}: no cargado</span>
                  )
                ))}
              </div>
            </section>
          </section>

          <section style={{ padding: "22px", background: "#FFFFFF", border: "1px solid #DDE7EC", borderRadius: "8px", boxShadow: "0 5px 20px rgba(0,0,0,0.06)" }}>
            {documentos.length ? (
              <>
                <h2 style={{ margin: "0 0 8px", color: "#3187B5", fontSize: "21px" }}>{contrato.contrato_aceptado ? "Documentos firmados" : "Documentos publicados"}</h2>
                <p style={{ margin: "0 0 16px", color: "#607D8B" }}>Consulta cada PDF. La aceptación aplica tu firma a todos los documentos.</p>
                {documentos.map((documento) => {
                  const id = (() => { try { const url = new URL(documento.url); return url.searchParams.get("id") || url.pathname.match(/\/file\/d\/([^/]+)/)?.[1]; } catch { return null; } })();
                  const src = id ? `${apiBase}/api/archivos?accion=contrato-empleado&fileId=${encodeURIComponent(id)}&cedula=${encodeURIComponent(contrato.cedula)}` : documento.url;
                  return <div key={documento.url} style={{ marginBottom: "18px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
                      <h3 style={{ fontSize: "16px", color: "#455A64" }}>{documento.name || "Documento PDF"}</h3>
                      <span style={{ display: "flex", gap: "8px" }}>
                        <button type="button" onClick={() => verDocumentoContrato(documento, contrato.cedula)} style={{ padding: "7px 12px", background: "white", border: "1px solid #3187B5", color: "#3187B5", borderRadius: "6px", fontWeight: "700", cursor: "pointer" }}>Ver</button>
                        <button type="button" onClick={() => void descargarDocumentoContrato(documento, contrato.cedula)} style={{ padding: "7px 12px", background: "#6BAA45", border: 0, color: "white", borderRadius: "6px", fontWeight: "700", cursor: "pointer" }}>Descargar</button>
                      </span>
                    </div>
                    <iframe title={documento.name || "Documento PDF"} src={src} style={{ display: "block", width: "100%", height: "min(60vh, 700px)", border: "1px solid #DDE7EC", borderRadius: "8px", background: "#F5F7F8" }} />
                  </div>;
                })}
                {!contrato.contrato_aceptado && (
                  <label style={{ display: "flex", gap: "8px", alignItems: "center", color: "#263238", marginTop: "12px" }}>
                    <input type="checkbox" checked={aceptaTodos} onChange={(event) => setAceptaTodos(event.target.checked)} />
                    He leído y acepto todos los documentos publicados.
                  </label>
                )}
                {!contrato.contrato_aceptado && <button type="button" onClick={() => void aceptarTodosLosDocumentos()} disabled={!aceptaTodos || aceptandoDocumentos} style={{ marginTop: "12px", padding: "10px 14px", border: 0, borderRadius: "6px", background: aceptandoDocumentos ? "#8295A0" : "#388E3C", color: "white", fontWeight: "700" }}>{aceptandoDocumentos ? "FIRMANDO..." : "ACEPTAR Y FIRMAR TODOS"}</button>}
              </>
            ) : (
              <>
                <h2 style={{ margin: "0 0 8px", color: "#3187B5", fontSize: "21px" }}>Contrato pendiente</h2>
                <p style={{ margin: 0, color: "#607D8B" }}>Tus datos están guardados. El contrato final aparecerá aquí cuando administración lo revise y lo publique.</p>
              </>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function Login() {
  const [modoAdmin, setModoAdmin] = useState(false);

  // ==============================
  // EMPLEADO
  // ==============================
  const [ingresado, setIngresado] = useState(false);
  const [mostrarBienvenida, setMostrarBienvenida] = useState(false);
  const [empleadoRegistrado, setEmpleadoRegistrado] = useState(false);
  const [documentosPorCorregir, setDocumentosPorCorregir] = useState([]);
  const [documento, setDocumento] = useState("");

  // ==============================
  // ADMINISTRADOR
  // ==============================
  const [adminIngresado, setAdminIngresado] = useState(false);
  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");

  const [cargando, setCargando] = useState(false);

  // =====================================================
  // INGRESAR EMPLEADO
  // SOLO PUEDEN INGRESAR CÉDULAS AUTORIZADAS
  // =====================================================

  const ingresarEmpleado = async () => {
    const cedula = documento.trim();

    if (cedula === "") {
      alert("Por favor ingrese su número de documento");
      return;
    }

    setCargando(true);

    try {
      // =================================================
      // BUSCAR LA CÉDULA EN USUARIOS AUTORIZADOS
      // =================================================

      const { data, error } = await supabase
        .from("usuarios_autorizados")
        .select("id, cedula, nombre_completo")
        .eq("cedula", cedula)
        .maybeSingle();

      if (error) {
        console.error(
          "Error al verificar usuario:",
          error
        );

        alert(
          "Ocurrió un error al verificar el usuario"
        );

        return;
      }

      // =================================================
      // SI LA CÉDULA NO EXISTE
      // =================================================

      if (!data) {
        alert(
          "Esta cédula no está autorizada para ingresar."
        );

        return;
      }

      const { data: empleadoExistente, error: errorEmpleado } = await supabase
        .from("empleados")
        .select(`id, documentos_revision, eps_otra, fondo_pension_otra, ${CAMPOS_ESTADO_FORMULARIO}`)
        .eq("cedula", cedula)
        .limit(1)
        .maybeSingle();

      if (errorEmpleado) throw errorEmpleado;

      // =================================================
      // SI LA CÉDULA SÍ ESTÁ AUTORIZADA
      // =================================================

      localStorage.setItem(
        "usuarioCedula",
        data.cedula
      );

      localStorage.setItem(
        "usuarioNombre",
        data.nombre_completo
      );
      setDocumento(data.cedula);
      setDocumentosPorCorregir(
        obtenerDocumentosPorCorregir(empleadoExistente?.documentos_revision)
      );
      setEmpleadoRegistrado(
        isFormularioEmpleadoCompleto(empleadoExistente)
        && obtenerDocumentosPorCorregir(empleadoExistente?.documentos_revision).length === 0
      );

      setMostrarBienvenida(true);
      setIngresado(true);

    } catch (error) {
      console.error(
        "Error al iniciar sesión:",
        error
      );

      alert(
        `Ocurrió un error al iniciar sesión${error?.message ? `.\n\nDetalle: ${error.message}` : ""}`
      );

    } finally {
      setCargando(false);
    }
  };

  // =====================================================
  // CERRAR SESIÓN EMPLEADO
  // =====================================================

  const cerrarSesionEmpleado = () => {
    localStorage.removeItem("usuarioCedula");
    localStorage.removeItem("usuarioNombre");

    setIngresado(false);
    setMostrarBienvenida(false);
    setDocumento("");
    setDocumentosPorCorregir([]);
    setModoAdmin(false);
  };

  // =====================================================
  // INGRESAR ADMINISTRADOR
  // =====================================================

  const ingresarAdministrador = async () => {
    if (
      correo.trim() === "" ||
      password.trim() === ""
    ) {
      alert("Por favor ingrese correo y contraseña");
      return;
    }

    setCargando(true);

    try {
      const { data, error } =
        await supabase.auth.signInWithPassword({
          email: correo.trim(),
          password: password,
        });

      if (error) {
        console.error(
          "Error de autenticación:",
          error
        );

        alert(`No se pudo iniciar sesión.\n\n${error.message}`);
        return;
      }

      if (!data?.user?.id) {
        alert("No se pudo identificar el usuario");
        return;
      }

      // =================================================
      // BUSCAR EL ROL DEL USUARIO
      // =================================================

      const {
        data: perfil,
        error: errorPerfil,
      } = await supabase
        .from("perfiles")
        .select("rol")
        .eq("id", data.user.id)
        .maybeSingle();

      if (errorPerfil) {
        console.error(
          "Error al consultar el perfil:",
          errorPerfil
        );

        await supabase.auth.signOut();

        alert(
          "No se pudo verificar el perfil del administrador"
        );

        return;
      }

      // =================================================
      // VERIFICAR QUE SEA ADMINISTRADOR
      // =================================================

      if (
        !perfil ||
        perfil.rol !== "admin"
      ) {
        await supabase.auth.signOut();

        alert(
          "Este usuario no tiene permisos de administrador."
        );

        return;
      }

      setAdminIngresado(true);

    } catch (error) {
      console.error("Error:", error);

      await supabase.auth.signOut();

      alert(
        "Ocurrió un error al iniciar sesión"
      );

    } finally {
      setCargando(false);
    }
  };

  // =====================================================
  // CERRAR SESIÓN ADMIN
  // =====================================================

  const cerrarSesionAdmin = async () => {
    await supabase.auth.signOut();

    setAdminIngresado(false);
    setCorreo("");
    setPassword("");
    setModoAdmin(false);
  };

  // =====================================================
  // PANEL ADMIN
  // =====================================================

  if (adminIngresado) {
    return (
      <PanelAdmin
        cerrarSesion={cerrarSesionAdmin}
      />
    );
  }

  // =====================================================
  // BIENVENIDA EMPLEADO
  // =====================================================

  if (
    ingresado &&
    mostrarBienvenida
  ) {
    return (
      <div
        style={{
          minHeight: "100vh",
          width: "100%",
          background:
            "linear-gradient(135deg, #EAF7F0 0%, #E8F4FA 50%, #F7FBFD 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "25px",
          boxSizing: "border-box",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* CÍRCULO DECORATIVO */}

        <div
          style={{
            position: "absolute",
            width: "300px",
            height: "300px",
            borderRadius: "50%",
            background:
              "rgba(139,195,74,0.15)",
            top: "-100px",
            left: "-100px",
          }}
        />

        <div
          style={{
            position: "absolute",
            width: "350px",
            height: "350px",
            borderRadius: "50%",
            background:
              "rgba(49,135,181,0.12)",
            bottom: "-150px",
            right: "-100px",
          }}
        />

        {/* TARJETA */}

        <div
          style={{
            width: "100%",
            maxWidth: "700px",
            background: "white",
            borderRadius: "28px",
            boxShadow:
              "0 20px 60px rgba(0,0,0,0.12)",
            overflow: "hidden",
            position: "relative",
            zIndex: 2,
          }}
        >
          {/* ENCABEZADO */}

          <div
            style={{
              background:
                "linear-gradient(135deg, #8BC34A 0%, #3187B5 100%)",
              padding: "45px 30px 55px",
              textAlign: "center",
              color: "white",
            }}
          >
            <div
              style={{
                width: "120px",
                height: "120px",
                margin: "0 auto 20px",
                borderRadius: "50%",
                background:
                  "rgba(255,255,255,0.22)",
                border:
                  "4px solid rgba(255,255,255,0.45)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow:
                  "0 10px 25px rgba(0,0,0,0.12)",
                overflow: "hidden",
              }}
            >
              <img
                src={logoRD}
                alt="RD Soluciones"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                }}
              />
            </div>

            <h1
              style={{
                margin: "0 0 10px",
                fontSize: "36px",
                fontWeight: "800",
              }}
            >
              ¡Bienvenido!
            </h1>

            <p
              style={{
                margin: 0,
                fontSize: "17px",
                opacity: 0.95,
              }}
            >
              Nos alegra tenerte aquí
            </p>
          </div>

          {/* CONTENIDO */}

          <div
            style={{
              padding: "35px 40px 40px",
              textAlign: "center",
            }}
          >
            <h2
              style={{
                margin: "0 0 12px",
                color: "#263238",
                fontSize: "24px",
              }}
            >
              Hola,{" "}
              {localStorage.getItem("usuarioNombre") ||
                "¡qué bueno verte!"}{" "}
            </h2>

            <p
              style={{
                color: "#607D8B",
                fontSize: "16px",
                lineHeight: "1.7",
                margin: "0 auto 30px",
                maxWidth: "560px",
              }}
            >
              Gracias por ser parte de nuestro
              equipo. A continuación podrás
              completar tu información personal
              y mantener tus datos actualizados.
            </p>

            {/* TARJETAS */}

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(3, 1fr)",
                gap: "15px",
                marginBottom: "32px",
              }}
            >
              <div
                style={{
                  background: "#F1F8E9",
                  borderRadius: "15px",
                  padding: "20px 10px",
                }}
              >
                <strong
                  style={{
                    color: "#558B2F",
                    fontSize: "13px",
                  }}
                >
                  Completa
                </strong>

                <div
                  style={{
                    color: "#78909C",
                    fontSize: "12px",
                    marginTop: "4px",
                  }}
                >
                  tu información
                </div>
              </div>

              <div
                style={{
                  background: "#E3F2FD",
                  borderRadius: "15px",
                  padding: "20px 10px",
                }}
              >
                <strong
                  style={{
                    color: "#1976A8",
                    fontSize: "13px",
                  }}
                >
                  Información
                </strong>

                <div
                  style={{
                    color: "#78909C",
                    fontSize: "12px",
                    marginTop: "4px",
                  }}
                >
                  protegida
                </div>
              </div>

              <div
                style={{
                  background: "#F5F5F5",
                  borderRadius: "15px",
                  padding: "20px 10px",
                }}
              >
                <strong
                  style={{
                    color: "#455A64",
                    fontSize: "13px",
                  }}
                >
                  Fácil y rápido
                </strong>

                <div
                  style={{
                    color: "#78909C",
                    fontSize: "12px",
                    marginTop: "4px",
                  }}
                >
                  de completar
                </div>
              </div>
            </div>

            {/* CONTINUAR */}

            <button
              onClick={() =>
                setMostrarBienvenida(false)
              }
              style={{
                width: "100%",
                maxWidth: "400px",
                height: "55px",
                border: "none",
                borderRadius: "12px",
                background:
                  "linear-gradient(135deg, #3187B5, #256D91)",
                color: "white",
                fontSize: "16px",
                fontWeight: "700",
                cursor: "pointer",
                boxShadow:
                  "0 8px 20px rgba(49,135,181,0.25)",
              }}
            >
              CONTINUAR AL FORMULARIO →
            </button>

            {/* CERRAR SESIÓN */}

            <button
              onClick={cerrarSesionEmpleado}
              style={{
                width: "100%",
                maxWidth: "400px",
                height: "45px",
                marginTop: "15px",
                border: "1px solid #E0E0E0",
                borderRadius: "10px",
                background: "white",
                color: "#D32F2F",
                fontSize: "14px",
                fontWeight: "600",
                cursor: "pointer",
              }}
            >
              CERRAR SESIÓN
            </button>

            <p
              style={{
                marginTop: "20px",
                marginBottom: 0,
                color: "#90A4AE",
                fontSize: "12px",
              }}
            >
              Tus datos son importantes
              para nosotros
            </p>
          </div>

          <div
            style={{
              height: "6px",
              background:
                "linear-gradient(90deg, #8BC34A, #3187B5)",
            }}
          />
        </div>
      </div>
    );
  }

  // =====================================================
  // FORMULARIO DEL EMPLEADO
  // =====================================================

  if (ingresado) {
    return (
      <div
        style={{
          minHeight: "100vh",
          width: "100%",
          background: "#F5F8FA",
        }}
      >
        {/* BARRA SUPERIOR */}

        <div
          style={{
            width: "100%",
            minHeight: "70px",
            background: "#FFFFFF",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 30px",
            boxSizing: "border-box",
            boxShadow:
              "0 3px 12px rgba(0,0,0,0.08)",
            borderBottom:
              "1px solid #E5E9EC",
            position: "sticky",
            top: 0,
            zIndex: 1000,
          }}
        >
          {/* USUARIO */}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "50%",
                background:
                  "linear-gradient(135deg, #8BC34A, #3187B5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "22px",
              }}
            >
              {(localStorage.getItem("usuarioNombre") || "U").trim().charAt(0).toUpperCase()}
            </div>

            <div>
              <div
                style={{
                  fontSize: "12px",
                  color: "#78909C",
                }}
              >
                Usuario
              </div>

              <div
                style={{
                  fontSize: "15px",
                  fontWeight: "700",
                  color: "#263238",
                }}
              >
                {localStorage.getItem(
                  "usuarioNombre"
                )}
              </div>

              <div
                style={{
                  fontSize: "12px",
                  color: "#78909C",
                }}
              >
                Cédula:{" "}
                {localStorage.getItem(
                  "usuarioCedula"
                )}
              </div>
            </div>
          </div>

          {/* CERRAR SESIÓN */}

          <button
            onClick={cerrarSesionEmpleado}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 16px",
              borderRadius: "9px",
              border:
                "1px solid #E0E0E0",
              background: "#FFFFFF",
              color: "#D32F2F",
              fontSize: "14px",
              fontWeight: "700",
              cursor: "pointer",
            }}
          >
            Cerrar sesión
          </button>
        </div>

        {empleadoRegistrado ? (
          <ContratoEmpleado />
        ) : (
          <Formulario
            correctionOnly={documentosPorCorregir.length > 0}
            onSaved={() => {
              setDocumentosPorCorregir([]);
              setEmpleadoRegistrado(true);
            }}
          />
        )}
      </div>
    );
  }

  // =====================================================
  // LOGIN ADMINISTRADOR
  // =====================================================

  if (modoAdmin) {
    return (
      <div
        style={{
          width: "100%",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#F5F8FA",
          padding: "20px",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "410px",
            background: "#FFFFFF",
            borderRadius: "16px",
            overflow: "hidden",
            boxShadow:
              "0 8px 30px rgba(0, 0, 0, 0.12)",
            border:
              "1px solid #E5E9EC",
          }}
        >
          {/* ENCABEZADO */}

          <div
            style={{
              background:
                "linear-gradient(135deg, #8BC34A 0%, #3187B5 100%)",
              padding: "30px",
              textAlign: "center",
              color: "white",
            }}
          >
            <div
              style={{
                width: "72px",
                height: "72px",
                margin: "0 auto 14px",
                borderRadius: "50%",
                background:
                  "rgba(255,255,255,0.22)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                border:
                  "3px solid rgba(255,255,255,0.4)",
              }}
            >
              <img
                src={logoRD}
                alt="RD Soluciones"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                }}
              />
            </div>

            <h2
              style={{
                margin: "0 0 5px",
                fontSize: "26px",
                fontWeight: "700",
              }}
            >
              Administrador
            </h2>

            <p
              style={{
                margin: 0,
                fontSize: "14px",
              }}
            >
              Acceso administrativo
            </p>
          </div>

          {/* FORMULARIO ADMIN */}

          <div style={{ padding: "30px" }}>
            <label
              style={{
                display: "block",
                marginBottom: "8px",
                fontWeight: "600",
                fontSize: "15px",
                color: "#263238",
              }}
            >
              Correo electrónico
            </label>

            <input
              type="email"
              placeholder="Ingrese su correo"
              value={correo}
              onChange={(e) =>
                setCorreo(e.target.value)
              }
              style={{
                width: "100%",
                height: "48px",
                padding: "0 14px",
                boxSizing: "border-box",
                border:
                  "1px solid #D5DDE2",
                borderRadius: "9px",
                fontSize: "15px",
                outline: "none",
                marginBottom: "18px",
              }}
            />

            <label
              style={{
                display: "block",
                marginBottom: "8px",
                fontWeight: "600",
                fontSize: "15px",
                color: "#263238",
              }}
            >
              Contraseña
            </label>

            <input
              type="password"
              placeholder="Ingrese su contraseña"
              value={password}
              onChange={(e) =>
                setPassword(e.target.value)
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  ingresarAdministrador();
                }
              }}
              style={{
                width: "100%",
                height: "48px",
                padding: "0 14px",
                boxSizing: "border-box",
                border:
                  "1px solid #D5DDE2",
                borderRadius: "9px",
                fontSize: "15px",
                outline: "none",
                marginBottom: "18px",
              }}
            />

            <button
              onClick={
                ingresarAdministrador
              }
              disabled={cargando}
              style={{
                width: "100%",
                height: "48px",
                border: "none",
                borderRadius: "9px",
                background: cargando
                  ? "#8FAEBF"
                  : "#3187B5",
                color: "#FFFFFF",
                fontSize: "15px",
                fontWeight: "700",
                cursor: cargando
                  ? "not-allowed"
                  : "pointer",
              }}
            >
              {cargando
                ? "VERIFICANDO..."
                : "INGRESAR COMO ADMIN"}
            </button>

            <button
              onClick={() => {
                setModoAdmin(false);
                setCorreo("");
                setPassword("");
              }}
              style={{
                width: "100%",
                marginTop: "15px",
                background:
                  "transparent",
                border: "none",
                color: "#3187B5",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: "600",
              }}
            >
              ← Volver al inicio
            </button>
          </div>

          <div
            style={{
              height: "5px",
              background:
                "linear-gradient(90deg, #8BC34A, #3187B5)",
            }}
          />
        </div>
      </div>
    );
  }

  // =====================================================
  // LOGIN EMPLEADO
  // =====================================================

  return (
    <div
      style={{
        width: "100%",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "linear-gradient(135deg, #EAF7F0, #E8F4FA)",
        padding: "20px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          background: "#FFFFFF",
          borderRadius: "20px",
          overflow: "hidden",
          boxShadow:
            "0 12px 40px rgba(0,0,0,0.12)",
        }}
      >
        {/* ENCABEZADO */}

        <div
          style={{
            background:
              "linear-gradient(135deg, #8BC34A 0%, #3187B5 100%)",
            padding: "35px 30px",
            textAlign: "center",
            color: "white",
          }}
        >
          <div
            style={{
              width: "90px",
              height: "90px",
              margin: "0 auto 15px",
              borderRadius: "50%",
              background:
                "rgba(255,255,255,0.22)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border:
                "3px solid rgba(255,255,255,0.4)",
              overflow: "hidden",
            }}
          >
            <img
              src={logoRD}
              alt="RD Soluciones"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
            />
          </div>

          <h2
            style={{
              margin: "0 0 7px",
              fontSize: "27px",
              fontWeight: "800",
            }}
          >
            Bienvenido
          </h2>

          <p
            style={{
              margin: 0,
              fontSize: "14px",
              opacity: 0.95,
            }}
          >
            Sistema De Registro De Personal
          </p>
        </div>

        {/* CONTENIDO */}

        <div style={{ padding: "32px" }}>
          <label
            style={{
              display: "block",
              marginBottom: "8px",
              fontWeight: "600",
              fontSize: "15px",
              color: "#263238",
            }}
          >
            Número de documento
          </label>

          <input
            type="text"
            placeholder="Ingrese su documento"
            value={documento}
            onChange={(e) =>
              setDocumento(e.target.value)
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                ingresarEmpleado();
              }
            }}
            style={{
              width: "100%",
              height: "50px",
              padding: "0 15px",
              boxSizing: "border-box",
              border:
                "1px solid #D5DDE2",
              borderRadius: "10px",
              fontSize: "15px",
              outline: "none",
              marginBottom: "18px",
            }}
          />

          <button
            onClick={ingresarEmpleado}
            disabled={cargando}
            style={{
              width: "100%",
              height: "50px",
              border: "none",
              borderRadius: "10px",
              background: cargando
                ? "#8FAEBF"
                : "#3187B5",
              color: "#FFFFFF",
              fontSize: "15px",
              fontWeight: "700",
              cursor: cargando
                ? "not-allowed"
                : "pointer",
            }}
          >
            {cargando
              ? "VERIFICANDO..."
              : "INGRESAR →"}
          </button>

          {/* ADMIN */}

          <button
            onClick={() =>
              setModoAdmin(true)
            }
            style={{
              width: "100%",
              marginTop: "20px",
              padding: "10px",
              background:
                "transparent",
              border: "none",
              color: "#607D8B",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: "600",
            }}
          >
            Ingresar como administrador
          </button>
        </div>

        {/* PIE */}

        <div
          style={{
            height: "6px",
            background:
              "linear-gradient(90deg, #8BC34A, #3187B5)",
          }}
        />
      </div>
    </div>
  );
}

export default Login;