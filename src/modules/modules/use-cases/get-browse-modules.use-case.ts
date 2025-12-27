import { Endpoints } from '#common/constants'
import { useFetch } from '#common/helpers'
import { createModulesPayload } from '#modules/modules/helpers'
import type { IUseCase } from '#common/types'
import type { Modules, ModulesAPIResponseModel } from '#modules/modules/models'
import type { z } from 'zod'

export class GetBrowseModulesUseCase implements IUseCase<{}, Modules> {
    async execute(): Promise<Modules> {
        const { data } = await useFetch<z.infer<typeof ModulesAPIResponseModel>>({
            endpoint: Endpoints.modules,
            params: {}
        })

        return createModulesPayload(data)
    }
}
