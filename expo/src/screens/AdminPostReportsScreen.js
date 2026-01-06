import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Modal,
  Alert,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useContext } from 'react';
import { ThemeContext } from '../contexts/ThemeContext';
import { postAPI } from '../services/api';
import { ModalAlertContext } from '../contexts/ModalAlertContext';

const AdminPostReportsScreen = ({ navigation }) => {
  const theme = useContext(ThemeContext);
  const { success, error, warning } = useContext(ModalAlertContext);

  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState('pending');
  const [stats, setStats] = useState({
    pending: 0,
    reviewed: 0,
    approved: 0,
    rejected: 0,
    total: 0,
  });
  const [actionLoading, setActionLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadReports();
    loadStats();
  }, []);

  useEffect(() => {
    loadReports();
  }, [filterStatus]);

  const loadReports = async () => {
    try {
      setLoading(true);
      const data = await postAPI.getReports();
      
      // Фильтруем по статусу
      const filtered = filterStatus === 'all' 
        ? data 
        : data.filter(r => r.status === filterStatus);
      
      setReports(filtered);
    } catch (err) {
      console.error('❌ Ошибка загрузки жалоб:', err);
      error('Ошибка', 'Не удалось загрузить жалобы');
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const statsData = await postAPI.getReportsStats();
      setStats(statsData);
    } catch (err) {
      console.error('❌ Ошибка загрузки статистики:', err);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadReports();
    await loadStats();
    setRefreshing(false);
  };

  const handleApproveReport = async (reportId, postId) => {
    Alert.alert(
      '🗑️ Удалить пост',
      'Вы уверены, что хотите удалить этот пост и одобрить жалобу?',
      [
        {
          text: 'Отмена',
          style: 'cancel',
        },
        {
          text: 'Удалить',
          onPress: async () => {
            try {
              setActionLoading(true);
              await postAPI.handleReport(reportId, 'approve');
              success('✅ Готово', 'Пост удален и жалоба одобрена');
              setShowDetailModal(false);
              await loadReports();
              await loadStats();
            } catch (err) {
              console.error('❌ Ошибка удаления поста:', err);
              error('Ошибка', 'Не удалось удалить пост');
            } finally {
              setActionLoading(false);
            }
          },
          style: 'destructive',
        },
      ]
    );
  };

  const handleRejectReport = async (reportId) => {
    Alert.alert(
      '❌ Отклонить жалобу',
      'Вы уверены, что хотите отклонить эту жалобу?',
      [
        {
          text: 'Отмена',
          style: 'cancel',
        },
        {
          text: 'Отклонить',
          onPress: async () => {
            try {
              setActionLoading(true);
              await postAPI.handleReport(reportId, 'reject');
              success('✅ Готово', 'Жалоба отклонена');
              setShowDetailModal(false);
              await loadReports();
              await loadStats();
            } catch (err) {
              console.error('❌ Ошибка отклонения жалобы:', err);
              error('Ошибка', 'Не удалось отклонить жалобу');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleBanUser = async (reportId, userId) => {
    Alert.alert(
      '🚫 Заблокировать пользователя',
      'На сколько дней заблокировать пользователя?',
      [
        {
          text: 'Отмена',
          style: 'cancel',
        },
        {
          text: '3 дня',
          onPress: () => banUser(reportId, 3),
        },
        {
          text: '7 дней',
          onPress: () => banUser(reportId, 7),
        },
        {
          text: '30 дней',
          onPress: () => banUser(reportId, 30),
        },
      ]
    );
  };

  const banUser = async (reportId, days) => {
    try {
      setActionLoading(true);
      await postAPI.handleReport(reportId, 'ban-user', days);
      success('✅ Готово', `Пользователь заблокирован на ${days} дней`);
      setShowDetailModal(false);
      await loadReports();
      await loadStats();
    } catch (err) {
      console.error('❌ Ошибка блокирования пользователя:', err);
      error('Ошибка', 'Не удалось заблокировать пользователя');
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadgeColor = (status) => {
    switch (status) {
      case 'pending':
        return '#FF9500';
      case 'reviewed':
        return '#5AC8FA';
      case 'approved':
        return '#34C759';
      case 'rejected':
        return '#CCCCCC';
      default:
        return theme.border;
    }
  };

  const getStatusLabel = (status) => {
    const labels = {
      pending: 'На рассмотрении',
      reviewed: 'Просмотрено',
      approved: 'Одобрено',
      rejected: 'Отклонено',
    };
    return labels[status] || status;
  };

  const ReportCard = ({ item }) => (
    <TouchableOpacity
      style={[styles.reportCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
      onPress={() => {
        setSelectedReport(item);
        setShowDetailModal(true);
      }}
    >
      <View style={styles.reportHeader}>
        <View style={styles.reportTitleSection}>
          <Text style={[styles.reportTitle, { color: theme.text }]} numberOfLines={2}>
            {item.post_content || 'Пост удален'}
          </Text>
          <Text style={[styles.reportDate, { color: theme.textSecondary }]}>
            {new Date(item.created_at).toLocaleDateString('ru-RU')}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusBadgeColor(item.status) }]}>
          <Text style={styles.statusText}>{getStatusLabel(item.status)}</Text>
        </View>
      </View>

      <View style={styles.reportBody}>
        <View style={styles.userInfo}>
          <Ionicons name="person-circle" size={32} color={theme.textSecondary} />
          <View style={styles.userDetails}>
            <Text style={[styles.userName, { color: theme.text }]}>
              {item.reporter_username}
            </Text>
            <Text style={[styles.userRole, { color: theme.textSecondary }]}>
              Пожаловался на пост
            </Text>
          </View>
        </View>

        <Text style={[styles.reasonPreview, { color: theme.textSecondary }]} numberOfLines={2}>
          "{item.reason}"
        </Text>
      </View>
    </TouchableOpacity>
  );

  const StatCard = ({ label, count, color }) => (
    <View style={[styles.statCard, { backgroundColor: theme.surface, borderColor: color }]}>
      <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{label}</Text>
      <Text style={[styles.statCount, { color }]}>{count}</Text>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={28} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          📋 Жалобы на посты
        </Text>
        <TouchableOpacity onPress={handleRefresh} style={styles.refreshButton}>
          <Ionicons name="refresh" size={24} color={theme.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={styles.content}
        refreshing={refreshing}
        onRefresh={handleRefresh}
      >
        {/* Statistics */}
        <View style={styles.statsContainer}>
          <StatCard label="На рассмотрении" count={stats.pending} color="#FF9500" />
          <StatCard label="Просмотрено" count={stats.reviewed} color="#5AC8FA" />
          <StatCard label="Одобрено" count={stats.approved} color="#34C759" />
          <StatCard label="Отклонено" count={stats.rejected} color="#CCCCCC" />
        </View>

        {/* Filter Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterTabs}
        >
          {['all', 'pending', 'reviewed', 'approved', 'rejected'].map((status) => (
            <TouchableOpacity
              key={status}
              style={[
                styles.filterTab,
                {
                  backgroundColor: filterStatus === status ? theme.primary : theme.surface,
                  borderColor: theme.border,
                },
              ]}
              onPress={() => setFilterStatus(status)}
            >
              <Text
                style={[
                  styles.filterTabText,
                  { color: filterStatus === status ? '#fff' : theme.text },
                ]}
              >
                {status === 'all' ? 'Все' : getStatusLabel(status)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Reports List */}
        {reports.length > 0 ? (
          <FlatList
            data={reports}
            renderItem={({ item }) => <ReportCard item={item} />}
            keyExtractor={(item) => item.id.toString()}
            scrollEnabled={false}
            contentContainerStyle={styles.listContent}
          />
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="checkmark-circle" size={64} color={theme.textSecondary} />
            <Text style={[styles.emptyText, { color: theme.text }]}>
              {filterStatus === 'pending'
                ? 'Нет жалоб на рассмотрении'
                : `Нет жалоб со статусом "${getStatusLabel(filterStatus)}"`}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Detail Modal */}
      {selectedReport && (
        <Modal
          visible={showDetailModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowDetailModal(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={[styles.detailModalContent, { backgroundColor: theme.surface }]}>
              {/* Close Button */}
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setShowDetailModal(false)}
              >
                <Ionicons name="close" size={28} color={theme.text} />
              </TouchableOpacity>

              <ScrollView style={styles.detailScrollView}>
                {/* Status */}
                <View
                  style={[
                    styles.statusSection,
                    {
                      backgroundColor: getStatusBadgeColor(selectedReport.status),
                      opacity: 0.1,
                    },
                  ]}
                >
                  <Text style={[styles.statusBig, { color: getStatusBadgeColor(selectedReport.status) }]}>
                    {getStatusLabel(selectedReport.status)}
                  </Text>
                </View>

                {/* Post Content */}
                <View style={styles.detailSection}>
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>
                    📝 Содержание поста
                  </Text>
                  <View style={[styles.postContentBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
                    <Text style={[styles.postContentText, { color: theme.text }]}>
                      {selectedReport.post_content || 'Пост удален'}
                    </Text>
                  </View>
                  <Text style={[styles.postAuthor, { color: theme.textSecondary }]}>
                    Автор: {selectedReport.post_author_username}
                  </Text>
                </View>

                {/* Reason */}
                <View style={styles.detailSection}>
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>
                    ⚠️ Причина жалобы
                  </Text>
                  <View style={[styles.reasonBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
                    <Text style={[styles.reasonText, { color: theme.text }]}>
                      {selectedReport.reason}
                    </Text>
                  </View>
                  <Text style={[styles.reporterInfo, { color: theme.textSecondary }]}>
                    Пожаловался: {selectedReport.reporter_username}
                  </Text>
                </View>

                {/* Timeline */}
                <View style={styles.detailSection}>
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>
                    ⏱️ История
                  </Text>
                  <View style={[styles.timelineItem, { borderLeftColor: theme.primary }]}>
                    <Text style={[styles.timelineLabel, { color: theme.text }]}>
                      Создана жалоба
                    </Text>
                    <Text style={[styles.timelineDate, { color: theme.textSecondary }]}>
                      {new Date(selectedReport.created_at).toLocaleString('ru-RU')}
                    </Text>
                  </View>
                  {selectedReport.reviewed_at && (
                    <View style={[styles.timelineItem, { borderLeftColor: '#34C759' }]}>
                      <Text style={[styles.timelineLabel, { color: theme.text }]}>
                        {selectedReport.status === 'approved' ? 'Пост удален' : 'Жалоба обработана'}
                      </Text>
                      <Text style={[styles.timelineDate, { color: theme.textSecondary }]}>
                        {new Date(selectedReport.reviewed_at).toLocaleString('ru-RU')}
                      </Text>
                      <Text style={[styles.timelineReviewer, { color: theme.textSecondary }]}>
                        Администратор: {selectedReport.reviewer_username}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Actions */}
                {selectedReport.status === 'pending' && (
                  <View style={styles.actionButtons}>
                    <TouchableOpacity
                      style={[styles.actionButton, { backgroundColor: '#34C759' }]}
                      onPress={() => handleApproveReport(selectedReport.id, selectedReport.post_id)}
                      disabled={actionLoading}
                    >
                      {actionLoading ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="trash" size={20} color="#fff" />
                          <Text style={styles.actionButtonText}>Удалить пост</Text>
                        </>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.actionButton, { backgroundColor: '#FF3B30' }]}
                      onPress={() => handleBanUser(selectedReport.id, selectedReport.reporter_id)}
                      disabled={actionLoading}
                    >
                      {actionLoading ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="ban" size={20} color="#fff" />
                          <Text style={styles.actionButtonText}>Заблокировать</Text>
                        </>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.actionButton, { backgroundColor: '#CCCCCC' }]}
                      onPress={() => handleRejectReport(selectedReport.id)}
                      disabled={actionLoading}
                    >
                      {actionLoading ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="close-circle" size={20} color="#fff" />
                          <Text style={styles.actionButtonText}>Отклонить</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    flex: 1,
    marginLeft: 8,
  },
  refreshButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    padding: 12,
  },
  statsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    minWidth: '48%',
    borderRadius: 12,
    borderWidth: 2,
    padding: 12,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  statCount: {
    fontSize: 24,
    fontWeight: '700',
  },
  filterTabs: {
    marginBottom: 16,
    marginHorizontal: -12,
    paddingHorizontal: 12,
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  filterTabText: {
    fontSize: 14,
    fontWeight: '500',
  },
  listContent: {
    paddingBottom: 20,
  },
  reportCard: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    overflow: 'hidden',
  },
  reportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  reportTitleSection: {
    flex: 1,
    marginRight: 8,
  },
  reportTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  reportDate: {
    fontSize: 12,
    marginTop: 4,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  reportBody: {
    padding: 12,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  userDetails: {
    marginLeft: 8,
    flex: 1,
  },
  userName: {
    fontSize: 13,
    fontWeight: '600',
  },
  userRole: {
    fontSize: 12,
  },
  reasonPreview: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 16,
    marginTop: 12,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  detailModalContent: {
    width: '100%',
    maxHeight: '90%',
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  closeButton: {
    alignSelf: 'flex-end',
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    margin: 8,
  },
  detailScrollView: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  statusSection: {
    marginHorizontal: -16,
    marginTop: -16,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  statusBig: {
    fontSize: 24,
    fontWeight: '700',
  },
  detailSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  postContentBox: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },
  postContentText: {
    fontSize: 14,
    lineHeight: 20,
  },
  postAuthor: {
    fontSize: 12,
  },
  reasonBox: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },
  reasonText: {
    fontSize: 14,
    lineHeight: 20,
  },
  reporterInfo: {
    fontSize: 12,
  },
  timelineItem: {
    borderLeftWidth: 3,
    paddingLeft: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  timelineLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  timelineDate: {
    fontSize: 12,
    marginTop: 4,
  },
  timelineReviewer: {
    fontSize: 12,
    marginTop: 4,
  },
  actionButtons: {
    marginTop: 20,
    marginHorizontal: -16,
    paddingHorizontal: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
});

export default AdminPostReportsScreen;
