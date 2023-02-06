;(() => {
  'use strict'
  var e = {
    914: function (e, _, E) {
      var a =
        (this && this.__createBinding) ||
        (Object.create
          ? function (e, _, E, a) {
              if (a === undefined) a = E
              Object.defineProperty(e, a, {
                enumerable: true,
                get: function () {
                  return _[E]
                },
              })
            }
          : function (e, _, E, a) {
              if (a === undefined) a = E
              e[a] = _[E]
            })
      var s =
        (this && this.__exportStar) ||
        function (e, _) {
          for (var E in e)
            if (E !== 'default' && !Object.prototype.hasOwnProperty.call(_, E))
              a(_, e, E)
        }
      Object.defineProperty(_, '__esModule', { value: true })
      s(E(863), _)
      s(E(96), _)
    },
    938: (e, _) => {
      Object.defineProperty(_, '__esModule', { value: true })
      _.TelemetrySdkLanguageValues =
        _.OsTypeValues =
        _.HostArchValues =
        _.AwsEcsLaunchtypeValues =
        _.CloudPlatformValues =
        _.CloudProviderValues =
        _.SemanticResourceAttributes =
          void 0
      _.SemanticResourceAttributes = {
        CLOUD_PROVIDER: 'cloud.provider',
        CLOUD_ACCOUNT_ID: 'cloud.account.id',
        CLOUD_REGION: 'cloud.region',
        CLOUD_AVAILABILITY_ZONE: 'cloud.availability_zone',
        CLOUD_PLATFORM: 'cloud.platform',
        AWS_ECS_CONTAINER_ARN: 'aws.ecs.container.arn',
        AWS_ECS_CLUSTER_ARN: 'aws.ecs.cluster.arn',
        AWS_ECS_LAUNCHTYPE: 'aws.ecs.launchtype',
        AWS_ECS_TASK_ARN: 'aws.ecs.task.arn',
        AWS_ECS_TASK_FAMILY: 'aws.ecs.task.family',
        AWS_ECS_TASK_REVISION: 'aws.ecs.task.revision',
        AWS_EKS_CLUSTER_ARN: 'aws.eks.cluster.arn',
        AWS_LOG_GROUP_NAMES: 'aws.log.group.names',
        AWS_LOG_GROUP_ARNS: 'aws.log.group.arns',
        AWS_LOG_STREAM_NAMES: 'aws.log.stream.names',
        AWS_LOG_STREAM_ARNS: 'aws.log.stream.arns',
        CONTAINER_NAME: 'container.name',
        CONTAINER_ID: 'container.id',
        CONTAINER_RUNTIME: 'container.runtime',
        CONTAINER_IMAGE_NAME: 'container.image.name',
        CONTAINER_IMAGE_TAG: 'container.image.tag',
        DEPLOYMENT_ENVIRONMENT: 'deployment.environment',
        DEVICE_ID: 'device.id',
        DEVICE_MODEL_IDENTIFIER: 'device.model.identifier',
        DEVICE_MODEL_NAME: 'device.model.name',
        FAAS_NAME: 'faas.name',
        FAAS_ID: 'faas.id',
        FAAS_VERSION: 'faas.version',
        FAAS_INSTANCE: 'faas.instance',
        FAAS_MAX_MEMORY: 'faas.max_memory',
        HOST_ID: 'host.id',
        HOST_NAME: 'host.name',
        HOST_TYPE: 'host.type',
        HOST_ARCH: 'host.arch',
        HOST_IMAGE_NAME: 'host.image.name',
        HOST_IMAGE_ID: 'host.image.id',
        HOST_IMAGE_VERSION: 'host.image.version',
        K8S_CLUSTER_NAME: 'k8s.cluster.name',
        K8S_NODE_NAME: 'k8s.node.name',
        K8S_NODE_UID: 'k8s.node.uid',
        K8S_NAMESPACE_NAME: 'k8s.namespace.name',
        K8S_POD_UID: 'k8s.pod.uid',
        K8S_POD_NAME: 'k8s.pod.name',
        K8S_CONTAINER_NAME: 'k8s.container.name',
        K8S_REPLICASET_UID: 'k8s.replicaset.uid',
        K8S_REPLICASET_NAME: 'k8s.replicaset.name',
        K8S_DEPLOYMENT_UID: 'k8s.deployment.uid',
        K8S_DEPLOYMENT_NAME: 'k8s.deployment.name',
        K8S_STATEFULSET_UID: 'k8s.statefulset.uid',
        K8S_STATEFULSET_NAME: 'k8s.statefulset.name',
        K8S_DAEMONSET_UID: 'k8s.daemonset.uid',
        K8S_DAEMONSET_NAME: 'k8s.daemonset.name',
        K8S_JOB_UID: 'k8s.job.uid',
        K8S_JOB_NAME: 'k8s.job.name',
        K8S_CRONJOB_UID: 'k8s.cronjob.uid',
        K8S_CRONJOB_NAME: 'k8s.cronjob.name',
        OS_TYPE: 'os.type',
        OS_DESCRIPTION: 'os.description',
        OS_NAME: 'os.name',
        OS_VERSION: 'os.version',
        PROCESS_PID: 'process.pid',
        PROCESS_EXECUTABLE_NAME: 'process.executable.name',
        PROCESS_EXECUTABLE_PATH: 'process.executable.path',
        PROCESS_COMMAND: 'process.command',
        PROCESS_COMMAND_LINE: 'process.command_line',
        PROCESS_COMMAND_ARGS: 'process.command_args',
        PROCESS_OWNER: 'process.owner',
        PROCESS_RUNTIME_NAME: 'process.runtime.name',
        PROCESS_RUNTIME_VERSION: 'process.runtime.version',
        PROCESS_RUNTIME_DESCRIPTION: 'process.runtime.description',
        SERVICE_NAME: 'service.name',
        SERVICE_NAMESPACE: 'service.namespace',
        SERVICE_INSTANCE_ID: 'service.instance.id',
        SERVICE_VERSION: 'service.version',
        TELEMETRY_SDK_NAME: 'telemetry.sdk.name',
        TELEMETRY_SDK_LANGUAGE: 'telemetry.sdk.language',
        TELEMETRY_SDK_VERSION: 'telemetry.sdk.version',
        TELEMETRY_AUTO_VERSION: 'telemetry.auto.version',
        WEBENGINE_NAME: 'webengine.name',
        WEBENGINE_VERSION: 'webengine.version',
        WEBENGINE_DESCRIPTION: 'webengine.description',
      }
      _.CloudProviderValues = {
        ALIBABA_CLOUD: 'alibaba_cloud',
        AWS: 'aws',
        AZURE: 'azure',
        GCP: 'gcp',
      }
      _.CloudPlatformValues = {
        ALIBABA_CLOUD_ECS: 'alibaba_cloud_ecs',
        ALIBABA_CLOUD_FC: 'alibaba_cloud_fc',
        AWS_EC2: 'aws_ec2',
        AWS_ECS: 'aws_ecs',
        AWS_EKS: 'aws_eks',
        AWS_LAMBDA: 'aws_lambda',
        AWS_ELASTIC_BEANSTALK: 'aws_elastic_beanstalk',
        AZURE_VM: 'azure_vm',
        AZURE_CONTAINER_INSTANCES: 'azure_container_instances',
        AZURE_AKS: 'azure_aks',
        AZURE_FUNCTIONS: 'azure_functions',
        AZURE_APP_SERVICE: 'azure_app_service',
        GCP_COMPUTE_ENGINE: 'gcp_compute_engine',
        GCP_CLOUD_RUN: 'gcp_cloud_run',
        GCP_KUBERNETES_ENGINE: 'gcp_kubernetes_engine',
        GCP_CLOUD_FUNCTIONS: 'gcp_cloud_functions',
        GCP_APP_ENGINE: 'gcp_app_engine',
      }
      _.AwsEcsLaunchtypeValues = { EC2: 'ec2', FARGATE: 'fargate' }
      _.HostArchValues = {
        AMD64: 'amd64',
        ARM32: 'arm32',
        ARM64: 'arm64',
        IA64: 'ia64',
        PPC32: 'ppc32',
        PPC64: 'ppc64',
        X86: 'x86',
      }
      _.OsTypeValues = {
        WINDOWS: 'windows',
        LINUX: 'linux',
        DARWIN: 'darwin',
        FREEBSD: 'freebsd',
        NETBSD: 'netbsd',
        OPENBSD: 'openbsd',
        DRAGONFLYBSD: 'dragonflybsd',
        HPUX: 'hpux',
        AIX: 'aix',
        SOLARIS: 'solaris',
        Z_OS: 'z_os',
      }
      _.TelemetrySdkLanguageValues = {
        CPP: 'cpp',
        DOTNET: 'dotnet',
        ERLANG: 'erlang',
        GO: 'go',
        JAVA: 'java',
        NODEJS: 'nodejs',
        PHP: 'php',
        PYTHON: 'python',
        RUBY: 'ruby',
        WEBJS: 'webjs',
      }
    },
    96: function (e, _, E) {
      var a =
        (this && this.__createBinding) ||
        (Object.create
          ? function (e, _, E, a) {
              if (a === undefined) a = E
              Object.defineProperty(e, a, {
                enumerable: true,
                get: function () {
                  return _[E]
                },
              })
            }
          : function (e, _, E, a) {
              if (a === undefined) a = E
              e[a] = _[E]
            })
      var s =
        (this && this.__exportStar) ||
        function (e, _) {
          for (var E in e)
            if (E !== 'default' && !Object.prototype.hasOwnProperty.call(_, E))
              a(_, e, E)
        }
      Object.defineProperty(_, '__esModule', { value: true })
      s(E(938), _)
    },
    841: (e, _) => {
      Object.defineProperty(_, '__esModule', { value: true })
      _.MessageTypeValues =
        _.RpcGrpcStatusCodeValues =
        _.MessagingOperationValues =
        _.MessagingDestinationKindValues =
        _.HttpFlavorValues =
        _.NetHostConnectionSubtypeValues =
        _.NetHostConnectionTypeValues =
        _.NetTransportValues =
        _.FaasInvokedProviderValues =
        _.FaasDocumentOperationValues =
        _.FaasTriggerValues =
        _.DbCassandraConsistencyLevelValues =
        _.DbSystemValues =
        _.SemanticAttributes =
          void 0
      _.SemanticAttributes = {
        AWS_LAMBDA_INVOKED_ARN: 'aws.lambda.invoked_arn',
        DB_SYSTEM: 'db.system',
        DB_CONNECTION_STRING: 'db.connection_string',
        DB_USER: 'db.user',
        DB_JDBC_DRIVER_CLASSNAME: 'db.jdbc.driver_classname',
        DB_NAME: 'db.name',
        DB_STATEMENT: 'db.statement',
        DB_OPERATION: 'db.operation',
        DB_MSSQL_INSTANCE_NAME: 'db.mssql.instance_name',
        DB_CASSANDRA_KEYSPACE: 'db.cassandra.keyspace',
        DB_CASSANDRA_PAGE_SIZE: 'db.cassandra.page_size',
        DB_CASSANDRA_CONSISTENCY_LEVEL: 'db.cassandra.consistency_level',
        DB_CASSANDRA_TABLE: 'db.cassandra.table',
        DB_CASSANDRA_IDEMPOTENCE: 'db.cassandra.idempotence',
        DB_CASSANDRA_SPECULATIVE_EXECUTION_COUNT:
          'db.cassandra.speculative_execution_count',
        DB_CASSANDRA_COORDINATOR_ID: 'db.cassandra.coordinator.id',
        DB_CASSANDRA_COORDINATOR_DC: 'db.cassandra.coordinator.dc',
        DB_HBASE_NAMESPACE: 'db.hbase.namespace',
        DB_REDIS_DATABASE_INDEX: 'db.redis.database_index',
        DB_MONGODB_COLLECTION: 'db.mongodb.collection',
        DB_SQL_TABLE: 'db.sql.table',
        EXCEPTION_TYPE: 'exception.type',
        EXCEPTION_MESSAGE: 'exception.message',
        EXCEPTION_STACKTRACE: 'exception.stacktrace',
        EXCEPTION_ESCAPED: 'exception.escaped',
        FAAS_TRIGGER: 'faas.trigger',
        FAAS_EXECUTION: 'faas.execution',
        FAAS_DOCUMENT_COLLECTION: 'faas.document.collection',
        FAAS_DOCUMENT_OPERATION: 'faas.document.operation',
        FAAS_DOCUMENT_TIME: 'faas.document.time',
        FAAS_DOCUMENT_NAME: 'faas.document.name',
        FAAS_TIME: 'faas.time',
        FAAS_CRON: 'faas.cron',
        FAAS_COLDSTART: 'faas.coldstart',
        FAAS_INVOKED_NAME: 'faas.invoked_name',
        FAAS_INVOKED_PROVIDER: 'faas.invoked_provider',
        FAAS_INVOKED_REGION: 'faas.invoked_region',
        NET_TRANSPORT: 'net.transport',
        NET_PEER_IP: 'net.peer.ip',
        NET_PEER_PORT: 'net.peer.port',
        NET_PEER_NAME: 'net.peer.name',
        NET_HOST_IP: 'net.host.ip',
        NET_HOST_PORT: 'net.host.port',
        NET_HOST_NAME: 'net.host.name',
        NET_HOST_CONNECTION_TYPE: 'net.host.connection.type',
        NET_HOST_CONNECTION_SUBTYPE: 'net.host.connection.subtype',
        NET_HOST_CARRIER_NAME: 'net.host.carrier.name',
        NET_HOST_CARRIER_MCC: 'net.host.carrier.mcc',
        NET_HOST_CARRIER_MNC: 'net.host.carrier.mnc',
        NET_HOST_CARRIER_ICC: 'net.host.carrier.icc',
        PEER_SERVICE: 'peer.service',
        ENDUSER_ID: 'enduser.id',
        ENDUSER_ROLE: 'enduser.role',
        ENDUSER_SCOPE: 'enduser.scope',
        THREAD_ID: 'thread.id',
        THREAD_NAME: 'thread.name',
        CODE_FUNCTION: 'code.function',
        CODE_NAMESPACE: 'code.namespace',
        CODE_FILEPATH: 'code.filepath',
        CODE_LINENO: 'code.lineno',
        HTTP_METHOD: 'http.method',
        HTTP_URL: 'http.url',
        HTTP_TARGET: 'http.target',
        HTTP_HOST: 'http.host',
        HTTP_SCHEME: 'http.scheme',
        HTTP_STATUS_CODE: 'http.status_code',
        HTTP_FLAVOR: 'http.flavor',
        HTTP_USER_AGENT: 'http.user_agent',
        HTTP_REQUEST_CONTENT_LENGTH: 'http.request_content_length',
        HTTP_REQUEST_CONTENT_LENGTH_UNCOMPRESSED:
          'http.request_content_length_uncompressed',
        HTTP_RESPONSE_CONTENT_LENGTH: 'http.response_content_length',
        HTTP_RESPONSE_CONTENT_LENGTH_UNCOMPRESSED:
          'http.response_content_length_uncompressed',
        HTTP_SERVER_NAME: 'http.server_name',
        HTTP_ROUTE: 'http.route',
        HTTP_CLIENT_IP: 'http.client_ip',
        AWS_DYNAMODB_TABLE_NAMES: 'aws.dynamodb.table_names',
        AWS_DYNAMODB_CONSUMED_CAPACITY: 'aws.dynamodb.consumed_capacity',
        AWS_DYNAMODB_ITEM_COLLECTION_METRICS:
          'aws.dynamodb.item_collection_metrics',
        AWS_DYNAMODB_PROVISIONED_READ_CAPACITY:
          'aws.dynamodb.provisioned_read_capacity',
        AWS_DYNAMODB_PROVISIONED_WRITE_CAPACITY:
          'aws.dynamodb.provisioned_write_capacity',
        AWS_DYNAMODB_CONSISTENT_READ: 'aws.dynamodb.consistent_read',
        AWS_DYNAMODB_PROJECTION: 'aws.dynamodb.projection',
        AWS_DYNAMODB_LIMIT: 'aws.dynamodb.limit',
        AWS_DYNAMODB_ATTRIBUTES_TO_GET: 'aws.dynamodb.attributes_to_get',
        AWS_DYNAMODB_INDEX_NAME: 'aws.dynamodb.index_name',
        AWS_DYNAMODB_SELECT: 'aws.dynamodb.select',
        AWS_DYNAMODB_GLOBAL_SECONDARY_INDEXES:
          'aws.dynamodb.global_secondary_indexes',
        AWS_DYNAMODB_LOCAL_SECONDARY_INDEXES:
          'aws.dynamodb.local_secondary_indexes',
        AWS_DYNAMODB_EXCLUSIVE_START_TABLE:
          'aws.dynamodb.exclusive_start_table',
        AWS_DYNAMODB_TABLE_COUNT: 'aws.dynamodb.table_count',
        AWS_DYNAMODB_SCAN_FORWARD: 'aws.dynamodb.scan_forward',
        AWS_DYNAMODB_SEGMENT: 'aws.dynamodb.segment',
        AWS_DYNAMODB_TOTAL_SEGMENTS: 'aws.dynamodb.total_segments',
        AWS_DYNAMODB_COUNT: 'aws.dynamodb.count',
        AWS_DYNAMODB_SCANNED_COUNT: 'aws.dynamodb.scanned_count',
        AWS_DYNAMODB_ATTRIBUTE_DEFINITIONS:
          'aws.dynamodb.attribute_definitions',
        AWS_DYNAMODB_GLOBAL_SECONDARY_INDEX_UPDATES:
          'aws.dynamodb.global_secondary_index_updates',
        MESSAGING_SYSTEM: 'messaging.system',
        MESSAGING_DESTINATION: 'messaging.destination',
        MESSAGING_DESTINATION_KIND: 'messaging.destination_kind',
        MESSAGING_TEMP_DESTINATION: 'messaging.temp_destination',
        MESSAGING_PROTOCOL: 'messaging.protocol',
        MESSAGING_PROTOCOL_VERSION: 'messaging.protocol_version',
        MESSAGING_URL: 'messaging.url',
        MESSAGING_MESSAGE_ID: 'messaging.message_id',
        MESSAGING_CONVERSATION_ID: 'messaging.conversation_id',
        MESSAGING_MESSAGE_PAYLOAD_SIZE_BYTES:
          'messaging.message_payload_size_bytes',
        MESSAGING_MESSAGE_PAYLOAD_COMPRESSED_SIZE_BYTES:
          'messaging.message_payload_compressed_size_bytes',
        MESSAGING_OPERATION: 'messaging.operation',
        MESSAGING_CONSUMER_ID: 'messaging.consumer_id',
        MESSAGING_RABBITMQ_ROUTING_KEY: 'messaging.rabbitmq.routing_key',
        MESSAGING_KAFKA_MESSAGE_KEY: 'messaging.kafka.message_key',
        MESSAGING_KAFKA_CONSUMER_GROUP: 'messaging.kafka.consumer_group',
        MESSAGING_KAFKA_CLIENT_ID: 'messaging.kafka.client_id',
        MESSAGING_KAFKA_PARTITION: 'messaging.kafka.partition',
        MESSAGING_KAFKA_TOMBSTONE: 'messaging.kafka.tombstone',
        RPC_SYSTEM: 'rpc.system',
        RPC_SERVICE: 'rpc.service',
        RPC_METHOD: 'rpc.method',
        RPC_GRPC_STATUS_CODE: 'rpc.grpc.status_code',
        RPC_JSONRPC_VERSION: 'rpc.jsonrpc.version',
        RPC_JSONRPC_REQUEST_ID: 'rpc.jsonrpc.request_id',
        RPC_JSONRPC_ERROR_CODE: 'rpc.jsonrpc.error_code',
        RPC_JSONRPC_ERROR_MESSAGE: 'rpc.jsonrpc.error_message',
        MESSAGE_TYPE: 'message.type',
        MESSAGE_ID: 'message.id',
        MESSAGE_COMPRESSED_SIZE: 'message.compressed_size',
        MESSAGE_UNCOMPRESSED_SIZE: 'message.uncompressed_size',
      }
      _.DbSystemValues = {
        OTHER_SQL: 'other_sql',
        MSSQL: 'mssql',
        MYSQL: 'mysql',
        ORACLE: 'oracle',
        DB2: 'db2',
        POSTGRESQL: 'postgresql',
        REDSHIFT: 'redshift',
        HIVE: 'hive',
        CLOUDSCAPE: 'cloudscape',
        HSQLDB: 'hsqldb',
        PROGRESS: 'progress',
        MAXDB: 'maxdb',
        HANADB: 'hanadb',
        INGRES: 'ingres',
        FIRSTSQL: 'firstsql',
        EDB: 'edb',
        CACHE: 'cache',
        ADABAS: 'adabas',
        FIREBIRD: 'firebird',
        DERBY: 'derby',
        FILEMAKER: 'filemaker',
        INFORMIX: 'informix',
        INSTANTDB: 'instantdb',
        INTERBASE: 'interbase',
        MARIADB: 'mariadb',
        NETEZZA: 'netezza',
        PERVASIVE: 'pervasive',
        POINTBASE: 'pointbase',
        SQLITE: 'sqlite',
        SYBASE: 'sybase',
        TERADATA: 'teradata',
        VERTICA: 'vertica',
        H2: 'h2',
        COLDFUSION: 'coldfusion',
        CASSANDRA: 'cassandra',
        HBASE: 'hbase',
        MONGODB: 'mongodb',
        REDIS: 'redis',
        COUCHBASE: 'couchbase',
        COUCHDB: 'couchdb',
        COSMOSDB: 'cosmosdb',
        DYNAMODB: 'dynamodb',
        NEO4J: 'neo4j',
        GEODE: 'geode',
        ELASTICSEARCH: 'elasticsearch',
        MEMCACHED: 'memcached',
        COCKROACHDB: 'cockroachdb',
      }
      _.DbCassandraConsistencyLevelValues = {
        ALL: 'all',
        EACH_QUORUM: 'each_quorum',
        QUORUM: 'quorum',
        LOCAL_QUORUM: 'local_quorum',
        ONE: 'one',
        TWO: 'two',
        THREE: 'three',
        LOCAL_ONE: 'local_one',
        ANY: 'any',
        SERIAL: 'serial',
        LOCAL_SERIAL: 'local_serial',
      }
      _.FaasTriggerValues = {
        DATASOURCE: 'datasource',
        HTTP: 'http',
        PUBSUB: 'pubsub',
        TIMER: 'timer',
        OTHER: 'other',
      }
      _.FaasDocumentOperationValues = {
        INSERT: 'insert',
        EDIT: 'edit',
        DELETE: 'delete',
      }
      _.FaasInvokedProviderValues = {
        ALIBABA_CLOUD: 'alibaba_cloud',
        AWS: 'aws',
        AZURE: 'azure',
        GCP: 'gcp',
      }
      _.NetTransportValues = {
        IP_TCP: 'ip_tcp',
        IP_UDP: 'ip_udp',
        IP: 'ip',
        UNIX: 'unix',
        PIPE: 'pipe',
        INPROC: 'inproc',
        OTHER: 'other',
      }
      _.NetHostConnectionTypeValues = {
        WIFI: 'wifi',
        WIRED: 'wired',
        CELL: 'cell',
        UNAVAILABLE: 'unavailable',
        UNKNOWN: 'unknown',
      }
      _.NetHostConnectionSubtypeValues = {
        GPRS: 'gprs',
        EDGE: 'edge',
        UMTS: 'umts',
        CDMA: 'cdma',
        EVDO_0: 'evdo_0',
        EVDO_A: 'evdo_a',
        CDMA2000_1XRTT: 'cdma2000_1xrtt',
        HSDPA: 'hsdpa',
        HSUPA: 'hsupa',
        HSPA: 'hspa',
        IDEN: 'iden',
        EVDO_B: 'evdo_b',
        LTE: 'lte',
        EHRPD: 'ehrpd',
        HSPAP: 'hspap',
        GSM: 'gsm',
        TD_SCDMA: 'td_scdma',
        IWLAN: 'iwlan',
        NR: 'nr',
        NRNSA: 'nrnsa',
        LTE_CA: 'lte_ca',
      }
      _.HttpFlavorValues = {
        HTTP_1_0: '1.0',
        HTTP_1_1: '1.1',
        HTTP_2_0: '2.0',
        SPDY: 'SPDY',
        QUIC: 'QUIC',
      }
      _.MessagingDestinationKindValues = { QUEUE: 'queue', TOPIC: 'topic' }
      _.MessagingOperationValues = { RECEIVE: 'receive', PROCESS: 'process' }
      _.RpcGrpcStatusCodeValues = {
        OK: 0,
        CANCELLED: 1,
        UNKNOWN: 2,
        INVALID_ARGUMENT: 3,
        DEADLINE_EXCEEDED: 4,
        NOT_FOUND: 5,
        ALREADY_EXISTS: 6,
        PERMISSION_DENIED: 7,
        RESOURCE_EXHAUSTED: 8,
        FAILED_PRECONDITION: 9,
        ABORTED: 10,
        OUT_OF_RANGE: 11,
        UNIMPLEMENTED: 12,
        INTERNAL: 13,
        UNAVAILABLE: 14,
        DATA_LOSS: 15,
        UNAUTHENTICATED: 16,
      }
      _.MessageTypeValues = { SENT: 'SENT', RECEIVED: 'RECEIVED' }
    },
    863: function (e, _, E) {
      var a =
        (this && this.__createBinding) ||
        (Object.create
          ? function (e, _, E, a) {
              if (a === undefined) a = E
              Object.defineProperty(e, a, {
                enumerable: true,
                get: function () {
                  return _[E]
                },
              })
            }
          : function (e, _, E, a) {
              if (a === undefined) a = E
              e[a] = _[E]
            })
      var s =
        (this && this.__exportStar) ||
        function (e, _) {
          for (var E in e)
            if (E !== 'default' && !Object.prototype.hasOwnProperty.call(_, E))
              a(_, e, E)
        }
      Object.defineProperty(_, '__esModule', { value: true })
      s(E(841), _)
    },
  }
  var _ = {}
  function __nccwpck_require__(E) {
    var a = _[E]
    if (a !== undefined) {
      return a.exports
    }
    var s = (_[E] = { exports: {} })
    var n = true
    try {
      e[E].call(s.exports, s, s.exports, __nccwpck_require__)
      n = false
    } finally {
      if (n) delete _[E]
    }
    return s.exports
  }
  if (typeof __nccwpck_require__ !== 'undefined')
    __nccwpck_require__.ab = __dirname + '/'
  var E = __nccwpck_require__(914)
  module.exports = E
})()
