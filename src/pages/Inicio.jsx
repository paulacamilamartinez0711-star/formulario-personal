import logoRD from "../assets/Logo RD Soluciones.jpg.jpeg";
import "./Inicio.css";

const pasos = [
  ["1", "Ingresa con tu documento", "Solo pueden entrar las personas autorizadas por la empresa."],
  ["2", "Completa tu formulario", "Diligencia tus datos y carga tus documentos. Puedes guardar tu avance."],
  ["3", "Firma tus documentos", "Revisa y acepta tu contrato desde la misma plataforma."],
];

function Inicio({ onIngresar }) {
  return (
    <div className="inicio-pagina" style={estilos.pagina}>
      <header className="inicio-encabezado" style={estilos.encabezado}>
        <div style={estilos.marca}>
          <img src={logoRD} alt="Consorcio RD Soluciones" style={estilos.logoPequeno} />
          <span style={estilos.nombreMarca}>Consorcio RD Soluciones</span>
        </div>
      </header>

      <main style={estilos.principal}>
        <section style={estilos.hero}>
          <div className="inicio-logo-contenedor">
            <span className="inicio-aro" aria-hidden="true" />
            <span className="inicio-aro inicio-aro-inverso" aria-hidden="true" />
            <span className="inicio-orbita" aria-hidden="true"><i /></span>
            <span className="inicio-orbita inicio-orbita-azul" aria-hidden="true"><i /></span>
            <img className="inicio-logo" src={logoRD} alt="Logo RD Soluciones" style={estilos.logoGrande} />
          </div>
          <h1 className="inicio-titulo" style={estilos.titulo}>Sistema de Registro de Personal</h1>
          <p className="inicio-subtitulo" style={estilos.subtitulo}>
            Bienvenido. Aquí puedes completar tu información, cargar tus documentos y firmar tu contrato de forma segura.
          </p>
          <button type="button" className="inicio-boton" onClick={onIngresar} style={estilos.botonPrincipal}>
            COMENZAR →
          </button>
        </section>

        <section style={estilos.pasos}>
          {pasos.map(([numero, titulo, texto]) => (
            <article key={numero} className="inicio-tarjeta" style={estilos.tarjeta}>
              <span style={estilos.numero}>{numero}</span>
              <h2 style={estilos.tarjetaTitulo}>{titulo}</h2>
              <p style={estilos.tarjetaTexto}>{texto}</p>
            </article>
          ))}
        </section>
      </main>

      <footer className="inicio-pie" style={estilos.pie}>
        Tus datos personales se usan únicamente para tu proceso de vinculación.
      </footer>
    </div>
  );
}

const estilos = {
  pagina: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    background: "linear-gradient(180deg, #F5F8FA 0%, #E3F0F7 100%)",
    fontFamily: "inherit",
  },
  encabezado: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    padding: "14px 24px",
    background: "#FFFFFF",
    borderBottom: "4px solid #8BC34A",
  },
  marca: { display: "flex", alignItems: "center", gap: "10px", minWidth: 0 },
  logoPequeno: { width: "42px", height: "42px", borderRadius: "50%", objectFit: "cover" },
  nombreMarca: { color: "#263238", fontWeight: "800", fontSize: "16px" },
  principal: { flex: 1, width: "100%", maxWidth: "1000px", margin: "0 auto", padding: "40px 20px", boxSizing: "border-box" },
  hero: { textAlign: "center", marginBottom: "40px" },
  logoGrande: {
    width: "130px",
    height: "130px",
    borderRadius: "50%",
    objectFit: "cover",
    border: "4px solid #8BC34A",
    background: "#FFFFFF",
  },
  titulo: { margin: "20px 0 10px", color: "#263238", fontSize: "clamp(26px, 5vw, 38px)", fontWeight: "800" },
  subtitulo: { maxWidth: "560px", margin: "0 auto 26px", color: "#607D8B", fontSize: "16px", lineHeight: 1.5 },
  botonPrincipal: {
    padding: "15px 40px",
    border: "none",
    borderRadius: "10px",
    background: "linear-gradient(135deg, #8BC34A 0%, #3187B5 100%)",
    color: "#FFFFFF",
    fontSize: "16px",
    fontWeight: "800",
    cursor: "pointer",
  },
  pasos: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 250px), 1fr))", gap: "18px" },
  tarjeta: { padding: "22px", background: "#FFFFFF", border: "1px solid #DDE7EC", borderRadius: "12px" },
  numero: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "34px",
    height: "34px",
    borderRadius: "50%",
    background: "#3187B5",
    color: "#FFFFFF",
    fontWeight: "800",
  },
  tarjetaTitulo: { margin: "12px 0 6px", color: "#263238", fontSize: "17px" },
  tarjetaTexto: { margin: 0, color: "#607D8B", fontSize: "14px", lineHeight: 1.5 },
  pie: { padding: "18px", textAlign: "center", color: "#607D8B", fontSize: "13px" },
};

export default Inicio;
