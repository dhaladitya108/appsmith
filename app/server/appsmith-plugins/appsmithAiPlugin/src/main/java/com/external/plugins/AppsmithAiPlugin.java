package com.external.plugins;

import com.appsmith.external.dtos.ExecuteActionDTO;
import com.appsmith.external.exceptions.pluginExceptions.AppsmithPluginError;
import com.appsmith.external.exceptions.pluginExceptions.AppsmithPluginException;
import com.appsmith.external.helpers.restApiUtils.connections.APIConnection;
import com.appsmith.external.helpers.restApiUtils.connections.ApiKeyAuthentication;
import com.appsmith.external.helpers.restApiUtils.helpers.RequestCaptureFilter;
import com.appsmith.external.models.ActionConfiguration;
import com.appsmith.external.models.ActionExecutionRequest;
import com.appsmith.external.models.ActionExecutionResult;
import com.appsmith.external.models.ApiKeyAuth;
import com.appsmith.external.models.BearerTokenAuth;
import com.appsmith.external.models.DatasourceConfiguration;
import com.appsmith.external.models.DatasourceStorage;
import com.appsmith.external.models.DatasourceTestResult;
import com.appsmith.external.models.Property;
import com.appsmith.external.models.UploadedFile;
import com.appsmith.external.plugins.BasePlugin;
import com.appsmith.external.plugins.BaseRestApiPluginExecutor;
import com.appsmith.external.services.SharedConfig;
import com.external.plugins.dtos.AiServerRequestDTO;
import com.external.plugins.dtos.Query;
import com.external.plugins.models.Feature;
import com.external.plugins.services.AiFeatureService;
import com.external.plugins.services.AiFeatureServiceFactory;
import com.external.plugins.services.AiServerService;
import com.external.plugins.services.AiServerServiceImpl;
import com.external.plugins.utils.RequestUtils;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.common.cache.Cache;
import com.google.common.cache.CacheBuilder;
import com.google.gson.Gson;
import lombok.extern.slf4j.Slf4j;
import org.json.JSONObject;
import org.pf4j.PluginWrapper;
import org.springframework.http.HttpMethod;
import org.springframework.web.reactive.function.BodyInserters;
import reactor.core.publisher.Mono;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import static com.external.plugins.constants.AppsmithAiConstants.MODEL;
import static com.external.plugins.constants.AppsmithAiConstants.USECASE;

@Slf4j
public class AppsmithAiPlugin extends BasePlugin {

    public AppsmithAiPlugin(PluginWrapper wrapper) {
        super(wrapper);
    }

    public static class AppsmithAiPluginExecutor extends BaseRestApiPluginExecutor {

        private static final Gson gson = new Gson();
        private static final AiServerService aiServerService = new AiServerServiceImpl();
        private static final Cache<String, JSONObject> modelResponseCache =
                CacheBuilder.newBuilder().expireAfterWrite(1, TimeUnit.DAYS).build();

        public AppsmithAiPluginExecutor(SharedConfig config) {
            super(config);
        }

        @Override
        public Mono<APIConnection> datasourceCreate(DatasourceConfiguration datasourceConfiguration) {
            ApiKeyAuth apiKeyAuth = new ApiKeyAuth();
            apiKeyAuth.setValue("test-key");
            return ApiKeyAuthentication.create(apiKeyAuth)
                    .flatMap(apiKeyAuthentication -> Mono.just((APIConnection) apiKeyAuthentication));
        }

        @Override
        public Mono<DatasourceStorage> postUpdateHook(DatasourceStorage datasourceStorage) {
            DatasourceConfiguration datasourceConfiguration = datasourceStorage.getDatasourceConfiguration();
            List<Property> properties = datasourceConfiguration.getProperties();
            ArrayList<String> files = new ArrayList<String>();
            ObjectMapper objectMapper = new ObjectMapper();
            UploadedFile file = objectMapper.convertValue(properties.get(0).getValue(), UploadedFile.class);
            files.add(file.getBase64Content());
            return aiServerService
                    .createDatasource(datasourceStorage.getId(), files)
                    .then(Mono.just(datasourceStorage));
        }

        @Override
        public Mono<ActionExecutionResult> executeParameterized(
                APIConnection connection,
                ExecuteActionDTO executeActionDTO,
                DatasourceConfiguration datasourceConfiguration,
                ActionConfiguration actionConfiguration) {

            // Get input from action configuration
            List<Map.Entry<String, String>> parameters = new ArrayList<>();

            prepareConfigurationsForExecution(executeActionDTO, actionConfiguration, datasourceConfiguration);
            // Filter out any empty headers
            headerUtils.removeEmptyHeaders(actionConfiguration);
            headerUtils.setHeaderFromAutoGeneratedHeaders(actionConfiguration);

            return this.executeCommon(connection, datasourceConfiguration, actionConfiguration, parameters);
        }

        public Mono<ActionExecutionResult> executeCommon(
                APIConnection apiConnection,
                DatasourceConfiguration datasourceConfiguration,
                ActionConfiguration actionConfiguration,
                List<Map.Entry<String, String>> insertedParams) {

            // Initializing object for error condition
            ActionExecutionResult errorResult = new ActionExecutionResult();
            initUtils.initializeResponseWithError(errorResult);

            Feature feature =
                    Feature.valueOf(RequestUtils.extractDataFromFormData(actionConfiguration.getFormData(), USECASE));
            AiFeatureService aiFeatureService = AiFeatureServiceFactory.getAiFeatureService(feature);
            Query query = aiFeatureService.createQuery(actionConfiguration);
            AiServerRequestDTO aiServerRequestDTO = new AiServerRequestDTO(feature, query);

            ActionExecutionResult actionExecutionResult = new ActionExecutionResult();
            ActionExecutionRequest actionExecutionRequest = RequestCaptureFilter.populateRequestFields(
                    actionConfiguration, RequestUtils.createQueryUri(), insertedParams, objectMapper);

            return aiServerService
                    .executeQuery(datasourceConfiguration.toString(), aiServerRequestDTO)
                    .map(response -> {
                        actionExecutionResult.setIsExecutionSuccess(true);
                        actionExecutionResult.setBody(response);
                        actionExecutionResult.setRequest(actionExecutionRequest);
                        return actionExecutionResult;
                    })
                    .onErrorResume(error -> {
                        errorResult.setIsExecutionSuccess(false);
                        log.error(
                                "An error has occurred while trying to run the AI server API query. Error: {}",
                                error.getMessage());
                        if (!(error instanceof AppsmithPluginException)) {
                            error = new AppsmithPluginException(
                                    AppsmithPluginError.PLUGIN_ERROR, error.getMessage(), error);
                        }
                        errorResult.setErrorInfo(error);
                        return Mono.just(errorResult);
                    });
        }

        private String cacheKey(String bearerToken) {
            return sha256(bearerToken);
        }

        private String sha256(String base) {
            try {
                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                byte[] hash = digest.digest(base.getBytes(StandardCharsets.UTF_8));
                StringBuilder hexString = new StringBuilder();

                for (byte b : hash) {
                    String hex = Integer.toHexString(0xff & b);
                    if (hex.length() == 1) hexString.append('0');
                    hexString.append(hex);
                }

                return hexString.toString();
            } catch (Exception ex) {
                throw new RuntimeException(ex);
            }
        }

        @Override
        public Mono<DatasourceTestResult> testDatasource(DatasourceConfiguration datasourceConfiguration) {
            final BearerTokenAuth bearerTokenAuth = (BearerTokenAuth) datasourceConfiguration.getAuthentication();

            HttpMethod httpMethod = HttpMethod.GET;
            URI uri = RequestUtils.createUriFromCommand(MODEL);

            return RequestUtils.makeRequest(httpMethod, uri, BodyInserters.empty())
                    .map(responseEntity -> {
                        if (responseEntity.getStatusCode().is2xxSuccessful()) {
                            return new DatasourceTestResult();
                        }

                        AppsmithPluginException error =
                                new AppsmithPluginException(AppsmithPluginError.PLUGIN_DATASOURCE_AUTHENTICATION_ERROR);
                        return new DatasourceTestResult(error.getMessage());
                    })
                    .onErrorResume(error -> {
                        if (!(error instanceof AppsmithPluginException)) {
                            error = new AppsmithPluginException(
                                    AppsmithPluginError.PLUGIN_DATASOURCE_AUTHENTICATION_ERROR);
                        }
                        return Mono.just(new DatasourceTestResult(error.getMessage()));
                    });
        }
    }
}