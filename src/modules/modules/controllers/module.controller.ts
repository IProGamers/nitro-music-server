import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { ModulesModel } from '#modules/modules/models'
import { ModuleService } from '#modules/modules/services/module.service'
import { z } from 'zod'
import type { Routes } from '#common/types'

export class ModuleController implements Routes {
    public controller: OpenAPIHono
    private moduleService: ModuleService

    constructor() {
        this.controller = new OpenAPIHono()
        this.moduleService = new ModuleService()
    }

    public initRoutes() {
        this.controller.openapi(
            createRoute({
                method: 'get',
                path: '/modules',
                tags: ['Modules'],
                summary: 'Retrieve browse modules',
                description: 'Retrieve browse modules for the home page including new releases, trending, charts, etc.',
                operationId: 'getBrowseModules',
                responses: {
                    200: {
                        description: 'Successful response with browse modules',
                        content: {
                            'application/json': {
                                schema: z.object({
                                    success: z.boolean(),
                                    data: ModulesModel
                                })
                            }
                        }
                    }
                }
            }),
            async (ctx) => {
                const response = await this.moduleService.getBrowseModules()

                return ctx.json({ success: true, data: response })
            }
        )
    }
}
