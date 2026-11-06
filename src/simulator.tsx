import { createRoot } from "react-dom/client"
import { InlineControls } from "./inline-controls"
import "./styles.css"

document.documentElement.classList.add("inline-document")
createRoot(document.getElementById("root")!).render(<InlineControls/>)
