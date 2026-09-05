import { createGetKcContextMock } from "keycloakify/login/KcContext"
import type { DeepPartial } from "keycloakify/tools/DeepPartial"
import { kcEnvDefaults, themeNames } from "../kc.gen"
import type {
  KcContext,
  KcContextExtension,
  KcContextExtensionPerPage,
} from "./KcContext"
import KcPage from "./KcPage"

const [themeName] = themeNames

if (themeName === undefined) {
  throw new Error("kc.gen.tsx did not generate any theme name")
}

const kcContextExtension: KcContextExtension = {
  themeName,
  properties: {
    ...kcEnvDefaults,
  },
}
const kcContextExtensionPerPage: KcContextExtensionPerPage = {}

export const { getKcContextMock } = createGetKcContextMock({
  kcContextExtension,
  kcContextExtensionPerPage,
  overrides: {},
  overridesPerPage: {},
})

export function createKcPageStory<PageId extends KcContext["pageId"]>(params: {
  pageId: PageId
}) {
  const { pageId } = params

  function KcPageStory(props: {
    kcContext?: DeepPartial<Extract<KcContext, { pageId: PageId }>>
  }) {
    const { kcContext: overrides } = props

    const kcContextMock = getKcContextMock({
      pageId,
      overrides,
    })

    return <KcPage kcContext={kcContextMock} />
  }

  return { KcPageStory }
}
