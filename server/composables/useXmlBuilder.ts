import { Builder } from "xml2js"
import type { TimelineContainer } from "../lib/plexPlayerTimeline"

export default function useXmlBuilder(container: TimelineContainer, headless: boolean = true) {
  if (!container) {
    throw new Error("Invalid container provided to useXmlBuilder")
  }
  const builder = new Builder({ headless: headless })
  const xmlString = builder.buildObject(container)
  return { xmlString }
}
